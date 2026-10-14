import { describe, expect, it, vi } from 'vitest'
import { pmsetHasAudioOut } from '../src/main/audioMonitor'

// Фрагменты реального вывода `pmset -g assertions` (macOS 27).
const PLAYING = `Listed by owning process:
   pid 2307(Music): [0x000037e0000192dd] 00:03:36 NoIdleSleepAssertion named: "Electron"
   pid 520(coreaudiod): [0x000038b80001935c] 00:00:00 PreventUserIdleSystemSleep named: "com.apple.audio.BuiltInSpeakerDevice.context.preventuseridlesleep"
	Created for PID: 93821.
	Resources: audio-out BuiltInSpeakerDevice
   pid 341(powerd): [0x000024de00018d3e] 01:24:42 PreventUserIdleSystemSleep named: "Powerd - Prevent sleep while display is on"`

const SILENT = `Listed by owning process:
   pid 2307(Music): [0x000037e0000192dd] 00:03:36 NoIdleSleepAssertion named: "Electron"
   pid 341(powerd): [0x000024de00018d3e] 01:24:42 PreventUserIdleSystemSleep named: "Powerd - Prevent sleep while display is on"`

const MICROPHONE = `Listed by owning process:
   pid 520(coreaudiod): [0x1] 00:00:03 PreventUserIdleSystemSleep named: "com.apple.audio.BuiltInMicrophoneDevice.context.preventuseridlesleep"
	Resources: audio-in BuiltInMicrophoneDevice`

describe('pmsetHasAudioOut', () => {
  it('звук на выходе — да; тишина и только микрофон — нет', () => {
    expect(pmsetHasAudioOut(PLAYING)).toBe(true)
    expect(pmsetHasAudioOut(SILENT)).toBe(false)
    expect(pmsetHasAudioOut(MICROPHONE)).toBe(false)
  })
})

describe('AudioMonitor (macOS)', () => {
  it.skipIf(process.platform !== 'darwin')('на старте тихо; пауза между треками не выключает музыку, две тихие проверки — выключают', async () => {
    vi.resetModules()
    const outputs: string[] = []
    vi.doMock('node:child_process', () => ({
      execFile: (_cmd: string, _args: string[], _opts: unknown, cb: (e: Error | null, out: string) => void) => cb(null, outputs.shift() ?? SILENT),
      spawn: () => {
        throw new Error('not used')
      }
    }))
    vi.useFakeTimers()
    const { AudioMonitor } = await import('../src/main/audioMonitor')
    const changes: boolean[] = []
    outputs.push(SILENT, SILENT, PLAYING, SILENT, PLAYING, SILENT, SILENT)
    const monitor = new AudioMonitor((playing) => changes.push(playing))
    monitor.start() // 1-й опрос: тихо
    expect(changes).toEqual([])
    vi.advanceTimersByTime(4000) // тихо
    vi.advanceTimersByTime(4000) // играет
    expect(changes).toEqual([true])
    vi.advanceTimersByTime(4000) // пауза между треками
    vi.advanceTimersByTime(4000) // снова играет
    expect(changes).toEqual([true])
    vi.advanceTimersByTime(8000) // две тихие проверки подряд
    expect(changes).toEqual([true, false])
    monitor.stop()
    vi.useRealTimers()
    vi.doUnmock('node:child_process')
  })
})
