// Определяет, играет ли на компьютере звук — чтобы питомец «слушал музыку».
// Никаких разрешений и чтения содержимого: только факт «звук выводится».
//  - macOS: `pmset -g assertions` — пока звук идёт на выход, coreaudiod держит отметку
//    «…preventuseridlesleep» с ресурсом audio-out (проверено на macOS 27).
//  - Windows: постоянный процесс PowerShell читает пиковый уровень системного аудиовыхода
//    (IAudioMeterInformation) раз в 2 с. Не проверено на Windows.
// Любой звук считается «музыкой»: видео и звонки тоже.

import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

const MAC_POLL_MS = 4000
/** Счётчик тишины на старте: звука ещё не было — тихо (иначе первые опросы сочли бы музыкой). */
const SILENT = 99

/** Разбор вывода `pmset -g assertions`: есть ли активный аудиовыход. */
export function pmsetHasAudioOut(output: string): boolean {
  const blocks = output.split(/\n(?=\s+pid \d+\()/)
  return blocks.some((block) => /\(coreaudiod\)/.test(block) && /preventuseridlesleep/i.test(block) && /audio-out/i.test(block))
}

const WINDOWS_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
[Guid("C02216F6-8C67-4B5B-9D00-D008E73E0064"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IAudioMeterInformation { int GetPeakValue(out float peak); }
[Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDevice { int Activate(ref Guid iid, int ctx, IntPtr p, [MarshalAs(UnmanagedType.IUnknown)] out object o); }
[Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
interface IMMDeviceEnumerator { int f(); int GetDefaultAudioEndpoint(int flow, int role, out IMMDevice d); }
[ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMDeviceEnumerator {}
public static class PetAudio {
  public static float Peak() {
    var e = (IMMDeviceEnumerator)new MMDeviceEnumerator();
    IMMDevice d; e.GetDefaultAudioEndpoint(0, 1, out d);
    var iid = typeof(IAudioMeterInformation).GUID; object o;
    d.Activate(ref iid, 23, IntPtr.Zero, out o);
    float p; ((IAudioMeterInformation)o).GetPeakValue(out p); return p;
  }
}
"@
while ($true) { try { [Console]::Out.WriteLine([PetAudio]::Peak()) } catch { [Console]::Out.WriteLine('-1') }; Start-Sleep -Seconds 2 }
`

export class AudioMonitor {
  private timer: NodeJS.Timeout | null = null
  private child: ChildProcessWithoutNullStreams | null = null
  private playing = false
  /** Сколько опросов подряд звук был тихим (паузы между песнями не считаются концом). */
  private quiet = SILENT

  constructor(private readonly onChange: (playing: boolean) => void) {}

  get running(): boolean {
    return this.timer !== null || this.child !== null
  }

  start(): void {
    if (this.running) return
    this.quiet = SILENT
    if (process.platform === 'darwin') {
      const poll = (): void => {
        execFile('/usr/bin/pmset', ['-g', 'assertions'], { timeout: 3000 }, (error, stdout) => {
          if (error) return
          // пауза между треками — не конец музыки: выключаем после двух тихих опросов подряд
          this.quiet = pmsetHasAudioOut(stdout) ? 0 : this.quiet + 1
          this.set(this.quiet < 2)
        })
      }
      poll()
      this.timer = setInterval(poll, MAC_POLL_MS)
    } else if (process.platform === 'win32') {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_SCRIPT], {
        windowsHide: true
      })
      this.child = child
      let buffer = ''
      child.stdout.on('data', (chunk: Buffer) => {
        buffer += chunk.toString()
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const peak = Number(line.trim().replace(',', '.'))
          if (!Number.isFinite(peak) || peak < 0) continue
          this.quiet = peak > 0.01 ? 0 : this.quiet + 1
          this.set(this.quiet < 3)
        }
      })
      child.on('exit', () => {
        if (this.child === child) this.child = null
      })
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.child?.kill()
    this.child = null
    this.set(false)
  }

  private set(playing: boolean): void {
    if (playing === this.playing) return
    this.playing = playing
    this.onChange(playing)
  }
}
