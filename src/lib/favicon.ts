/**
 * 提醒态把 favicon 换成一枚纯色圆环。
 *
 * 品牌图标是带高斯滤镜和多层渐变的复杂 SVG，在 canvas 里复刻既不现实也没必要——
 * 这一层要的只是「标签栏里一眼看出颜色变了」，纯色反而比缩小的品牌图更醒目。
 */

const SIZE = 64

let link: HTMLLinkElement | null = null
let original: { href: string; type: string } | null = null

function ensureLink() {
  if (typeof document === 'undefined') return null
  if (!link?.isConnected) {
    link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    // 只在第一次拿到 link 时记原值，之后即使被我们改过也不会覆盖这份快照
    original ??= {
      href: link.getAttribute('href') ?? '',
      type: link.getAttribute('type') ?? '',
    }
  }
  return link
}

export function setAlertFavicon(color: string) {
  const el = ensureLink()
  if (!el) return

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2 - 2, 0, Math.PI * 2)
  ctx.fill()

  // 中间挖个白环跟应用里的专注环呼应；纯色实心块在深色标签栏上容易糊成一坨
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 7
  ctx.beginPath()
  ctx.arc(SIZE / 2, SIZE / 2, SIZE / 4, 0, Math.PI * 2)
  ctx.stroke()

  el.setAttribute('type', 'image/png')
  el.setAttribute('href', canvas.toDataURL('image/png'))
}

export function restoreFavicon() {
  if (!link || !original) return
  if (original.type) link.setAttribute('type', original.type)
  else link.removeAttribute('type')
  link.setAttribute('href', original.href)
}
