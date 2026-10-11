import './Header.css'

export default function Header() {
  return (
    <header className="app-header">
      <div className="app-header__content">
        <div className="app-header__logo">
          <span className="app-header__icon">⚔️</span>
          <h1>Lords Mobile Academy</h1>
        </div>
        <p className="app-header__tagline">Maîtrisez les tactiques, dominez les batailles</p>
      </div>
    </header>
  )
}
