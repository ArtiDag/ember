import { useEffect, useState } from 'react'
import { setLang, tr } from '../../shared/i18n'
import { EmberMark, LanguageMenu, ThemeToggle } from './HeaderControls'
import type { SettingsPatch } from '../../shared/settings'
import { SETTINGS_LIMITS } from '../../shared/settings'
import type { AppState, CharacterSummary } from '../../shared/types'
import { SpritePreview } from './SpritePreview'

const api = window.settingsApi

/** Имена персонажей на языке интерфейса. */
const BUILTIN_NAMES: Record<string, () => string> = {
  ugolek: () => tr('Бес', 'Imp', '小鬼'),
  // чёрный кролик, отскочивший от уголька, — искра
  bunny: () => tr('Искорка', 'Sparky', '火花')
}
const nameOf = (c: CharacterSummary): string => BUILTIN_NAMES[c.id]?.() ?? c.name

const kindLabel = (kind: CharacterSummary['kind']): string =>
  ({
    static: tr('статичный', 'static', '静态'),
    animated: tr('анимация', 'animated', '动画'),
    look: tr('следит глазами и строит рожицы', 'follows with its eyes and makes faces', '眼睛跟随光标、会做鬼脸'),
    rig: tr('живая анимация', 'live animation', '实时动画')
  })[kind]

export function App() {
  const [state, setState] = useState<AppState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api.getState().then(setState)
    return api.onState(setState)
  }, [])

  if (!state) return <div className="loading">…</div>

  const { settings, characters, displays } = state
  // язык окна — из настроек (переключается сразу, без перезапуска)
  setLang(settings.language)
  document.documentElement.lang = settings.language
  const update = (patch: SettingsPatch): void => {
    setState({ ...state, settings: { ...settings, ...patch } })
    void api.update(patch)
  }

  const select = async (id: string): Promise<void> => {
    const res = await api.selectCharacter(id)
    if (!res.ok) setError(res.error)
  }

  const active = characters.find((c) => c.id === settings.activeCharacterId)
  const status = settings.visible ? (settings.paused ? tr('на паузе', 'paused', '已暂停') : tr('на экране', 'on screen', '在屏幕上')) : tr('скрыт', 'hidden', '已隐藏')

  return (
    <div className="app">
      <header className="top">
        <EmberMark className="top-mark" />
        <div className="top-text">
          <h1>Ember</h1>
          <p>
            {tr('Сейчас', 'Now', '当前')}: <b>{active ? nameOf(active) : '—'}</b>
            {' · '}
            {status}
          </p>
        </div>
        <div className="top-actions">
          <LanguageMenu value={settings.language} onChange={(language) => update({ language })} />
          <ThemeToggle theme={settings.theme} onChange={(theme) => update({ theme })} />
          <button onClick={() => void api.petAction(settings.visible ? 'hide' : 'show')}>
            {settings.visible ? tr('Скрыть', 'Hide', '隐藏') : tr('Показать', 'Show', '显示')}
          </button>
          <button onClick={() => void api.petAction('toggle-pause')}>{settings.paused ? tr('Продолжить', 'Resume', '继续') : tr('Пауза', 'Pause', '暂停')}</button>
          <button onClick={() => void api.petAction('recenter')}>{tr('Вернуть на экран', 'Bring back', '移回屏幕')}</button>
        </div>
      </header>

      {error && (
        <div className="alert" role="alert">
          <pre>{error}</pre>
          <button className="link" onClick={() => setError(null)}>
            {tr('закрыть', 'close', '关闭')}
          </button>
        </div>
      )}

      <section>
        <h2>{tr('Персонажи', 'Characters', '角色')}</h2>
        <div className="grid">
          {characters.map((character) => {
            const isActive = character.id === settings.activeCharacterId
            return (
              <div key={character.id} className={`card ${isActive ? 'active' : ''}`}>
                <button className="card-main" onClick={() => void select(character.id)} title={tr('Сделать активным', 'Make active', '设为当前')}>
                  <SpritePreview character={character} />
                  <span className="card-name">{nameOf(character)}</span>
                  <span className="card-kind">
                    {kindLabel(character.kind)}
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      </section>

      <div className="columns">
        <section>
          <h2>{tr('Внешний вид', 'Appearance', '外观')}</h2>
          <Range
            label={tr('Размер', 'Size', '大小')}
            value={settings.size}
            min={SETTINGS_LIMITS.size.min}
            max={SETTINGS_LIMITS.size.max}
            step={4}
            format={(v) => `${v} px`}
            onChange={(size) => update({ size })}
          />
          <Range
            label={tr('Прозрачность', 'Opacity', '不透明度')}
            value={settings.opacity}
            min={SETTINGS_LIMITS.opacity.min}
            max={SETTINGS_LIMITS.opacity.max}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(opacity) => update({ opacity })}
          />
          <label className="field">
            <span>{tr('Монитор', 'Display', '显示器')}</span>
            <select value={settings.displayId ?? ''} onChange={(e) => update({ displayId: Number(e.target.value) })}>
              {settings.displayId === null && <option value="">—</option>}
              {displays.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                  {d.primary ? ` (${tr('основной', 'main', '主显示器')})` : ''} — {d.workArea.width}×{d.workArea.height}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section>
          <h2>{tr('Поведение', 'Behaviour', '行为')}</h2>
          <Toggle label={tr('Гулять по экрану', 'Walk around the screen', '在屏幕上散步')} checked={settings.walking} onChange={(walking) => update({ walking })} />
          <Range
            label={tr('Скорость', 'Speed', '速度')}
            value={settings.speed}
            min={SETTINGS_LIMITS.speed.min}
            max={SETTINGS_LIMITS.speed.max}
            step={5}
            format={(v) => `${v} ${tr('px/с', 'px/s', '像素/秒')}`}
            onChange={(speed) => update({ speed })}
            disabled={!settings.walking}
          />
          <Toggle label={tr('Пауза', 'Pause', '暂停')} checked={settings.paused} onChange={(paused) => update({ paused })} />
          <Toggle
            label={tr('Поверх всех окон', 'Always on top', '置于所有窗口之上')}
            hint={tr(
              'Выключите — и персонаж будет жить на рабочем столе: открытые окна его закроют',
              'Turn off and the character lives on the desktop: open windows will cover it',
              '关闭后角色会待在桌面上：打开的窗口会把它挡住'
            )}
            checked={settings.alwaysOnTop}
            onChange={(alwaysOnTop) => update({ alwaysOnTop })}
          />
          <Toggle
            label={tr('Следить взглядом за курсором', 'Follow the cursor with the eyes', '眼睛跟随光标')}
            hint={tr('Персонаж поворачивает голову и глаза к курсору', 'The character turns its head and eyes towards the cursor', '角色会把头和眼睛转向光标')}
            checked={settings.followCursor}
            onChange={(followCursor) => update({ followCursor })}
          />
          <Toggle
            label={tr('Реагировать на музыку', 'React to music', '对音乐做出反应')}
            hint={tr(
              'Когда на компьютере играет звук, персонаж надевает наушники',
              'When sound is playing, the character puts on headphones',
              '电脑播放声音时，角色会戴上耳机'
            )}
            checked={settings.reactToMusic}
            onChange={(reactToMusic) => update({ reactToMusic })}
          />
          <Toggle
            label={tr('Запускать при входе в систему', 'Launch at login', '登录时启动')}
            hint={
              state.installed
                ? tr('Питомец появится сам после включения компьютера', 'The pet will appear on its own after the computer starts', '开机后宠物会自动出现')
                : tr('Работает только в установленном приложении', 'Only works in the installed app', '仅在已安装的应用中有效')
            }
            checked={settings.launchAtLogin}
            onChange={(launchAtLogin) => update({ launchAtLogin })}
          />
          <Toggle
            label={tr('Плавная анимация', 'Smooth animation', '流畅动画')}
            hint={tr(
              'Кадры перетекают друг в друга, персонаж дышит и моргает. Выключите на слабом компьютере',
              'Frames blend into each other, the character breathes and blinks. Turn off on a slow computer',
              '帧之间平滑过渡，角色会呼吸和眨眼。电脑较慢时可关闭'
            )}
            checked={settings.smooth}
            onChange={(smooth) => update({ smooth })}
          />
          <Toggle
            label={tr('Клики сквозь прозрачные области', 'Click through transparent areas', '点击穿透透明区域')}
            hint={tr(
              'Если клики по питомцу работают ненадёжно — выключите: окно станет кликабельным целиком',
              'If clicking the pet is unreliable, turn this off: the whole window becomes clickable',
              '如果点击宠物不灵敏，请关闭：整个窗口都可点击'
            )}
            checked={settings.clickThrough}
            onChange={(clickThrough) => update({ clickThrough })}
          />
        </section>
      </div>

      <section className="chatter">
        <h2>{tr('Реплики', 'Phrases', '台词')}</h2>
        <div className="columns">
          <div>
            <Toggle
              label={tr('Говорить в облачке', 'Talk in a speech bubble', '在气泡里说话')}
              hint={tr(
                'Шутки, забавные факты и поддержка — время от времени, пока вы за компьютером',
                'Jokes, fun facts and encouragement — every now and then while you are at the computer',
                '你在电脑前时，偶尔说说笑话、冷知识和鼓励的话'
              )}
              checked={settings.chatter}
              onChange={(chatter) => update({ chatter })}
            />
            <Toggle
              label={tr('Напоминать о перерыве', 'Remind me to take breaks', '提醒休息')}
              hint={tr(
                'Примерно через 50 минут работы без пауз, потом каждые 40 минут',
                'After about 50 minutes of work without a pause, then every 40 minutes',
                '连续工作约 50 分钟后提醒，之后每 40 分钟一次'
              )}
              checked={settings.breakReminders}
              onChange={(breakReminders) => update({ breakReminders })}
            />
          </div>
          <div>
            <label className={`field ${settings.chatter ? '' : 'disabled'}`}>
              <span>{tr('Как часто', 'How often', '频率')}</span>
              <select
                value={settings.chatterFrequency}
                disabled={!settings.chatter}
                onChange={(e) => update({ chatterFrequency: e.target.value as typeof settings.chatterFrequency })}
              >
                <option value="rare">{tr('Редко — раз в 15–25 минут', 'Rarely — every 15–25 minutes', '很少——每 15–25 分钟')}</option>
                <option value="normal">{tr('Иногда — раз в 6–12 минут', 'Sometimes — every 6–12 minutes', '有时——每 6–12 分钟')}</option>
                <option value="often">{tr('Часто — раз в 2–5 минут', 'Often — every 2–5 minutes', '经常——每 2–5 分钟')}</option>
              </select>
            </label>
            {/* род есть только в русских репликах */}
            {settings.language === 'ru' && (
              <label className={`field ${settings.chatter ? '' : 'disabled'}`}>
                <span>Как ко мне обращаться</span>
                <select
                  value={settings.addressAs}
                  disabled={!settings.chatter}
                  onChange={(e) => update({ addressAs: e.target.value as typeof settings.addressAs })}
                >
                  <option value="neutral">Не важно — только фразы без рода</option>
                  <option value="m">В мужском роде — «ты вернулся»</option>
                  <option value="f">В женском роде — «ты вернулась»</option>
                </select>
              </label>
            )}
            <label className={`field ${settings.chatter ? '' : 'disabled'}`}>
              <span>{tr('Цвет облачка', 'Bubble colour', '气泡颜色')}</span>
              <select
                value={settings.bubbleStyle}
                disabled={!settings.chatter}
                onChange={(e) => update({ bubbleStyle: e.target.value as typeof settings.bubbleStyle })}
              >
                <option value="light">{tr('Светлое — белое с тонкой обводкой', 'Light — white with a thin outline', '浅色——白底细边框')}</option>
                <option value="dark">{tr('Тёмное — как кролик, светлый текст', 'Dark — like the bunny, light text', '深色——像兔子一样，浅色文字')}</option>
              </select>
            </label>
            <button disabled={!settings.visible} onClick={() => void api.petAction('say')}>
              {tr('Сказать что-нибудь', 'Say something', '说点什么')}
            </button>
          </div>
        </div>
      </section>

      <footer>
        {state.platform === 'darwin'
          ? tr(
              'Управление всегда доступно через значок в строке меню. Закрытие этого окна не завершает приложение.',
              'Controls are always available from the menu bar icon. Closing this window does not quit the app.',
              '随时可以通过菜单栏图标控制。关闭此窗口不会退出应用。'
            )
          : tr(
              'Управление всегда доступно через значок в системном трее. Закрытие этого окна не завершает приложение.',
              'Controls are always available from the system tray icon. Closing this window does not quit the app.',
              '随时可以通过系统托盘图标控制。关闭此窗口不会退出应用。'
            )}
      </footer>

    </div>
  )
}

function Range(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
  disabled?: boolean
}) {
  return (
    <label className={`field range ${props.disabled ? 'disabled' : ''}`}>
      <span>
        {props.label} <output>{props.format(props.value)}</output>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  )
}

function Toggle(props: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
      <span className="toggle-text">
        {props.label}
        {props.hint && <small>{props.hint}</small>}
      </span>
    </label>
  )
}
