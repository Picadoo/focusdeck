type OverlayCloser = () => boolean

const stack: OverlayCloser[] = []

export function registerOverlay(closer: OverlayCloser) {
  stack.push(closer)
  return () => {
    const index = stack.lastIndexOf(closer)
    if (index >= 0) stack.splice(index, 1)
  }
}

export function closeTopOverlay() {
  while (stack.length > 0) {
    const closer = stack.pop()
    if (closer?.()) return true
  }
  return false
}
