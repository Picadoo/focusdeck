import { LOCALES, LOCALE_LABELS, LOCALE_SHORT_LABELS, useI18n } from '../../i18n'
import './language-switch.css'

/**
 * 两种语言用分段按钮直接摆出来，比下拉少一次点击，也一眼能看出当前是哪个。
 * 语言多起来再换成下拉。
 */
export function LanguageSwitch() {
  const { locale, setLocale, t } = useI18n()

  return (
    <div className="language-switch" role="group" aria-label={t('settings.language')}>
      {LOCALES.map((item) => (
        <button
          key={item}
          type="button"
          className={`language-switch-item ${item === locale ? 'active' : ''}`}
          aria-pressed={item === locale}
          title={t('settings.language.switchTo', { name: LOCALE_LABELS[item] })}
          onClick={() => setLocale(item)}
        >
          {LOCALE_SHORT_LABELS[item]}
        </button>
      ))}
    </div>
  )
}
