import { ref } from 'vue';

export interface WebSocketMessage {
  type: string;
  data?: any;
  message?: string;
  // Forum post fields
  threadId?: number;
  post?: any;
  authorAccount?: string;
}

// Singleton WebSocket instance shared across all components
const ws = ref<WebSocket | null>(null);
const isConnected = ref(false);
const lastMessage = ref<WebSocketMessage | null>(null);
const latency = ref<number | null>(null);
let pingSentAt: number | null = null;
const newEventCallbacks = ref<Array<(event: any) => void>>([]);
const statsUpdateCallbacks = ref<Array<(stats: any) => void>>([]);
const fragUpdateCallbacks = ref<Array<() => void>>([]);
const healthUpdateCallbacks = ref<Array<(health: any) => void>>([]);
const crashAlertCallbacks = ref<Array<(crash: any) => void>>([]);
const backupProgressCallbacks = ref<Array<(data: any) => void>>([]);
const restoreProgressCallbacks = ref<Array<(data: any) => void>>([]);
const mudStateCallbacks = ref<Array<(data: any) => void>>([]);
const mudControlOutputCallbacks = ref<Array<(data: any) => void>>([]);
const forumPostCallbacks = ref<Array<(data: { threadId: number; post: any; authorAccount: string }) => void>>([]);
const auctionNewCallbacks = ref<Array<(data: any) => void>>([]);
const auctionBidCallbacks = ref<Array<(data: any) => void>>([]);
const auctionCloseCallbacks = ref<Array<(data: any) => void>>([]);
const notificationCallbacks = ref<Array<(accountName: string, data: any) => void>>([]);
const deleteProgressCallbacks = ref<Array<(data: { requestId: string; message: string; status: string }) => void>>([]);

export function useWebSocket() {

  const connect = () => {
    // Force close any existing connection first (handles HMR and stale connections)
    if (ws.value) {
      try {
        ws.value.close();
      } catch {
        // Ignore errors when closing
      }
      ws.value = null;
      isConnected.value = false;
    }

    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001/ws';

    try {
      ws.value = new WebSocket(wsUrl);

      ws.value.onopen = () => {
        isConnected.value = true;
      };

      ws.value.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          lastMessage.value = message;

          // Handle pong for latency measurement
          if (message.type === 'pong') {
            if (pingSentAt !== null) {
              latency.value = Math.round(performance.now() - pingSentAt);
              pingSentAt = null;
            }
            return;
          }

          // Handle new PvP event
          if (message.type === 'NEW_PVP_EVENT' && message.data) {
            newEventCallbacks.value.forEach((callback) => {
              callback(message.data);
            });
          }

          // Handle stats update
          if (message.type === 'STATS_UPDATE' && message.data) {
            statsUpdateCallbacks.value.forEach((callback) => {
              callback(message.data);
            });
          }

          // Handle frag update
          if (message.type === 'FRAG_UPDATE') {
            fragUpdateCallbacks.value.forEach((callback) => {
              callback();
            });
          }

          // Handle health update
          if (message.type === 'HEALTH_UPDATE' && message.data) {
            healthUpdateCallbacks.value.forEach((callback) => {
              callback(message.data);
            });
          }

          // Handle crash alert
          if (message.type === 'CRASH_ALERT' && message.data) {
            crashAlertCallbacks.value.forEach((callback) => {
              callback(message.data);
            });
          }

          // Handle backup progress
          if (message.type === 'BACKUP_PROGRESS' && message.data) {
            backupProgressCallbacks.value.forEach((callback) => {
              callback(message.data);
            });
          }

          // Handle restore progress
          if (message.type === 'RESTORE_PROGRESS' && message.data) {
            restoreProgressCallbacks.value.forEach((callback) => {
              callback(message.data);
            });
          }

          // Handle MUD state change
          if (message.type === 'MUD_STATE_CHANGE' && message.data) {
            mudStateCallbacks.value.forEach((callback) => {
              callback(message.data);
            });
          }

          // Handle MUD control output
          if (message.type === 'MUD_CONTROL_OUTPUT' && message.data) {
            mudControlOutputCallbacks.value.forEach((callback) => {
              callback(message.data);
            });
          }

          // Handle new forum post
          if (message.type === 'NEW_FORUM_POST' && message.threadId !== undefined) {
            forumPostCallbacks.value.forEach((callback) => {
              callback({
                threadId: message.threadId as number,
                post: message.post,
                authorAccount: message.authorAccount as string
              });
            });
          }

          // Handle auction events
          if (message.type === 'AUCTION_NEW' && message.data) {
            auctionNewCallbacks.value.forEach((callback) => {
              callback(message.data);
            });
          }

          if (message.type === 'AUCTION_BID' && message.data) {
            auctionBidCallbacks.value.forEach((callback) => {
              callback(message.data);
            });
          }

          if (message.type === 'AUCTION_CLOSE' && message.data) {
            auctionCloseCallbacks.value.forEach((callback) => {
              callback(message.data);
            });
          }

          // Handle new notification
          if (message.type === 'NEW_NOTIFICATION' && message.data) {
            const accountName = (message as any).accountName;
            notificationCallbacks.value.forEach((callback) => {
              callback(accountName, message.data);
            });
          }

          // Handle news update
          if (message.type === 'NEWS_UPDATED' && message.data) {
            window.dispatchEvent(new CustomEvent('news-updated', {
              detail: message.data,
            }));
          }

          // Handle delete progress
          if (message.type === 'DELETE_PROGRESS' && message.data) {
            deleteProgressCallbacks.value.forEach((callback) => {
              callback(message.data);
            });
          }
        } catch {
        }
      };

      ws.value.onerror = () => {
      };

      ws.value.onclose = () => {
        isConnected.value = false;

        // Attempt to reconnect after 5 seconds
        setTimeout(() => {
          connect();
        }, 5000);
      };
    } catch {
    }
  };

  const disconnect = () => {
    if (ws.value) {
      ws.value.close();
      ws.value = null;
      isConnected.value = false;
    }
  };

  const onNewEvent = (callback: (event: any) => void) => {
    newEventCallbacks.value.push(callback);
  };

  const offNewEvent = (callback: (event: any) => void) => {
    const index = newEventCallbacks.value.indexOf(callback);
    if (index > -1) {
      newEventCallbacks.value.splice(index, 1);
    }
  };

  const onStatsUpdate = (callback: (stats: any) => void) => {
    statsUpdateCallbacks.value.push(callback);
  };

  const offStatsUpdate = (callback: (stats: any) => void) => {
    const index = statsUpdateCallbacks.value.indexOf(callback);
    if (index > -1) {
      statsUpdateCallbacks.value.splice(index, 1);
    }
  };

  const onFragUpdate = (callback: () => void) => {
    fragUpdateCallbacks.value.push(callback);
  };

  const offFragUpdate = (callback: () => void) => {
    const index = fragUpdateCallbacks.value.indexOf(callback);
    if (index > -1) {
      fragUpdateCallbacks.value.splice(index, 1);
    }
  };

  const onHealthUpdate = (callback: (health: any) => void) => {
    healthUpdateCallbacks.value.push(callback);
  };

  const offHealthUpdate = (callback: (health: any) => void) => {
    const index = healthUpdateCallbacks.value.indexOf(callback);
    if (index > -1) {
      healthUpdateCallbacks.value.splice(index, 1);
    }
  };

  const onCrashAlert = (callback: (crash: any) => void) => {
    crashAlertCallbacks.value.push(callback);
  };

  const offCrashAlert = (callback: (crash: any) => void) => {
    const index = crashAlertCallbacks.value.indexOf(callback);
    if (index > -1) {
      crashAlertCallbacks.value.splice(index, 1);
    }
  };

  const onBackupProgress = (callback: (data: any) => void) => {
    backupProgressCallbacks.value.push(callback);
  };

  const offBackupProgress = (callback: (data: any) => void) => {
    const index = backupProgressCallbacks.value.indexOf(callback);
    if (index > -1) {
      backupProgressCallbacks.value.splice(index, 1);
    }
  };

  const onRestoreProgress = (callback: (data: any) => void) => {
    restoreProgressCallbacks.value.push(callback);
  };

  const offRestoreProgress = (callback: (data: any) => void) => {
    const index = restoreProgressCallbacks.value.indexOf(callback);
    if (index > -1) {
      restoreProgressCallbacks.value.splice(index, 1);
    }
  };

  const onMudStateChange = (callback: (data: any) => void) => {
    mudStateCallbacks.value.push(callback);
  };

  const offMudStateChange = (callback: (data: any) => void) => {
    const index = mudStateCallbacks.value.indexOf(callback);
    if (index > -1) {
      mudStateCallbacks.value.splice(index, 1);
    }
  };

  const onMudControlOutput = (callback: (data: any) => void) => {
    mudControlOutputCallbacks.value.push(callback);
  };

  const offMudControlOutput = (callback: (data: any) => void) => {
    const index = mudControlOutputCallbacks.value.indexOf(callback);
    if (index > -1) {
      mudControlOutputCallbacks.value.splice(index, 1);
    }
  };

  const onForumPost = (callback: (data: { threadId: number; post: any; authorAccount: string }) => void) => {
    forumPostCallbacks.value.push(callback);
  };

  const offForumPost = (callback: (data: { threadId: number; post: any; authorAccount: string }) => void) => {
    const index = forumPostCallbacks.value.indexOf(callback);
    if (index > -1) {
      forumPostCallbacks.value.splice(index, 1);
    }
  };

  const onAuctionNew = (callback: (data: any) => void) => {
    auctionNewCallbacks.value.push(callback);
  };

  const offAuctionNew = (callback: (data: any) => void) => {
    const index = auctionNewCallbacks.value.indexOf(callback);
    if (index > -1) {
      auctionNewCallbacks.value.splice(index, 1);
    }
  };

  const onAuctionBid = (callback: (data: any) => void) => {
    auctionBidCallbacks.value.push(callback);
  };

  const offAuctionBid = (callback: (data: any) => void) => {
    const index = auctionBidCallbacks.value.indexOf(callback);
    if (index > -1) {
      auctionBidCallbacks.value.splice(index, 1);
    }
  };

  const onAuctionClose = (callback: (data: any) => void) => {
    auctionCloseCallbacks.value.push(callback);
  };

  const offAuctionClose = (callback: (data: any) => void) => {
    const index = auctionCloseCallbacks.value.indexOf(callback);
    if (index > -1) {
      auctionCloseCallbacks.value.splice(index, 1);
    }
  };

  const onNotification = (callback: (accountName: string, data: any) => void) => {
    notificationCallbacks.value.push(callback);
  };

  const offNotification = (callback: (accountName: string, data: any) => void) => {
    const index = notificationCallbacks.value.indexOf(callback);
    if (index > -1) {
      notificationCallbacks.value.splice(index, 1);
    }
  };

  const onDeleteProgress = (callback: (data: { requestId: string; message: string; status: string }) => void) => {
    deleteProgressCallbacks.value.push(callback);
  };

  const offDeleteProgress = (callback: (data: { requestId: string; message: string; status: string }) => void) => {
    const index = deleteProgressCallbacks.value.indexOf(callback);
    if (index > -1) {
      deleteProgressCallbacks.value.splice(index, 1);
    }
  };

  const sendMessage = (message: any) => {
    if (ws.value && isConnected.value) {
      ws.value.send(JSON.stringify(message));
    }
  };

  const measureLatency = () => {
    if (ws.value && isConnected.value && pingSentAt === null) {
      pingSentAt = performance.now();
      ws.value.send('{"type":"ping"}');
    }
  };

  return {
    socket: ws,
    isConnected,
    lastMessage,
    latency,
    connect,
    disconnect,
    sendMessage,
    measureLatency,
    onNewEvent,
    offNewEvent,
    onStatsUpdate,
    offStatsUpdate,
    onFragUpdate,
    offFragUpdate,
    onHealthUpdate,
    offHealthUpdate,
    onCrashAlert,
    offCrashAlert,
    onBackupProgress,
    offBackupProgress,
    onRestoreProgress,
    offRestoreProgress,
    onMudStateChange,
    offMudStateChange,
    onMudControlOutput,
    offMudControlOutput,
    onForumPost,
    offForumPost,
    onAuctionNew,
    offAuctionNew,
    onAuctionBid,
    offAuctionBid,
    onAuctionClose,
    offAuctionClose,
    onNotification,
    offNotification,
    onDeleteProgress,
    offDeleteProgress,
  };
}
