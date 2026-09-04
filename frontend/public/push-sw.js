self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { body: event.data ? event.data.text() : '' }
  }

  const title = typeof payload.title === 'string' ? payload.title : 'DurisWeb'
  const options = {
    body: typeof payload.body === 'string' ? payload.body : '',
    icon: typeof payload.icon === 'string' ? payload.icon : '/favicon.ico',
    badge: typeof payload.badge === 'string' ? payload.badge : undefined,
    tag: typeof payload.tag === 'string' ? payload.tag : undefined,
    data: payload.data && typeof payload.data === 'object' ? payload.data : {},
    actions: Array.isArray(payload.actions) ? payload.actions : undefined,
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const requestedPath = event.notification.data?.url
  const requestedUrl = new URL(
    typeof requestedPath === 'string' ? requestedPath : '/',
    self.location.origin,
  )
  const targetUrl =
    requestedUrl.origin === self.location.origin
      ? requestedUrl.href
      : new URL('/', self.location.origin).href

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      })
      const matchingClient = windowClients.find((client) => client.url === targetUrl)
      if (matchingClient) {
        await matchingClient.focus()
        return
      }

      const existingClient = windowClients[0]
      if (existingClient && 'navigate' in existingClient) {
        await existingClient.navigate(targetUrl)
        await existingClient.focus()
        return
      }

      await self.clients.openWindow(targetUrl)
    })(),
  )
})
