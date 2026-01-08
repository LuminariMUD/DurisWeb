export interface HotbarButton {
  id: string
  icon: string // lucide icon name
  command: string // command to execute
  label: string // tooltip text
  color: string // button color (hex)
  enabled: boolean
}

export interface HotbarSettings {
  buttons: HotbarButton[]
  position: { x: number; y: number }
  snapEdge: 'top' | 'bottom' | 'left' | 'right' | 'none'
  orientation: 'auto' | 'horizontal' | 'vertical'
  buttonSize: 'small' | 'medium' | 'large'
  visible: boolean
}

export interface HotbarIconOption {
  name: string
  value: string
}
