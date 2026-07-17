import { Image, Text } from 'bike/app'

// Demonstrates a ticking badge: `tick: 1` re-renders the badge every second
// and supplies `env.now` (epoch seconds). Shown on rows with a `@clock`
// attribute; displays the live wall-clock time.

export function registerClock() {
  bike.badge('clock', {
    where: '.@clock',
    tick: 1,
    render: (values, env) => {
      const d = new Date((env.now ?? 0) * 1000)
      const pad = (n: number) => String(n).padStart(2, '0')
      const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
      return Image.fromText(new Text(time, env.font, env.color.alphaSet(0.6)))
    },
  })
}
