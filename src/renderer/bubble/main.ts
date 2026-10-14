// Облачко с репликой: только показывает текст, никакого ввода (окно пропускает клики).

const api = window.bubbleApi
const bubble = document.getElementById('bubble')!
const text = document.getElementById('text')!
const tail = document.getElementById('tail') as unknown as SVGSVGElement

api.onShow((message) => {
  document.body.classList.toggle('below', message.placement === 'below')
  document.body.classList.toggle('dark', message.style === 'dark')
  // хвостик — только на прямом участке низа (по краям облачко скруглено)
  tail.style.left = `clamp(30px, calc(50% + ${message.tailOffset}px), calc(100% - 30px))`
  if (text.textContent === message.text && bubble.classList.contains('on')) return
  // textContent, не innerHTML: текст всегда просто текст.
  text.textContent = message.text
  bubble.classList.remove('on')
  void bubble.offsetWidth
  bubble.classList.add('on')
})

api.onHide(() => bubble.classList.remove('on'))
