const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.000)?Z)?$/

const parseDate = (dateString) => {
  const value = String(dateString)
  const dateOnly = value.match(DATE_ONLY_PATTERN)

  if (dateOnly) {
    const [, year, month, day] = dateOnly
    return new Date(Number(year), Number(month) - 1, Number(day))
  }

  return new Date(value)
}

export const formatDate = (dateString) =>
  parseDate(dateString).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

export const formatTime = (dateString) =>
  new Date(dateString).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

export const formatClockTime = (timeString) => {
  const [hours, minutes] = String(timeString || '')
    .split(':')
    .map(Number)
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return ''
  return new Date(2000, 0, 1, hours, minutes).toLocaleTimeString('es-CO', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export const formatRelative = (dateString) => {
  const diff = Date.now() - parseDate(dateString)
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return 'Ahora'
  if (minutes < 60) return `Hace ${minutes}m`
  if (hours < 24) return `Hace ${hours}h`
  if (days < 7) return `Hace ${days}d`
  return formatDate(dateString)
}

export const formatFriendlyDateTime = (dateString, timeString) => {
  if (!dateString && !timeString) return ''
  const parts = []
  if (dateString) {
    const d = parseDate(dateString)
    const today = new Date()
    const isToday = d.toDateString() === today.toDateString()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = d.toDateString() === yesterday.toDateString()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const isTomorrow = d.toDateString() === tomorrow.toDateString()

    if (isToday) parts.push('Hoy')
    else if (isYesterday) parts.push('Ayer')
    else if (isTomorrow) parts.push('Mañana')
    else {
      parts.push(d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }))
    }
  }
  if (timeString) {
    parts.push(formatClockTime(timeString))
  }
  return parts.filter(Boolean).join(' · ')
}

