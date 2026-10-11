import { tutorials } from '../data/tutorials'
import TutorialCard from '../components/TutorialCard'
import HeroSection from '../components/HeroSection'
import Header from '../components/Header'
import './HomePage.css'

interface HomePageProps {
  onSelectTutorial: (tutorialId: string) => void
}

export default function HomePage({ onSelectTutorial }: HomePageProps) {
  const publishedTutorials = tutorials.filter(t => t.status === 'published')
  const comingSoonTutorials = tutorials.filter(t => t.status === 'coming-soon')
  const categories = [...new Set(tutorials.map(t => t.category))]

  return (
    <div className="home-page">
      <Header />
      
      {/* Hero Section with background image */}
      <HeroSection />

      {/* Description Section */}
      <section className="intro-section">
        <div className="container">
          <div className="intro-content">
            <h2 className="intro-title">Bienvenue à l'Académie</h2>
            <div className="intro-text">
              <p>
                Que vous soyez nouvel arrivant ou joueur vétéran, Lords Mobile Academy vous guide 
                à travers les meilleures stratégies, formations et tactiques de combat.
              </p>
              <p>
                Chaque tutoriel est conçu pour être ludique, interactif et facilement mémorisable. 
                Apprenez à votre rythme, et dominez votre prochaine bataille.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Tutoriels publiés */}
      {publishedTutorials.length > 0 && (
        <section className="tutorials-section">
          <div className="container">
            <h2 className="tutorials-section__title">Tutoriels Disponibles</h2>
            <div className="tutorials-grid">
              {publishedTutorials.map(tutorial => (
                <TutorialCard 
                  key={tutorial.id} 
                  tutorial={tutorial} 
                  onSelect={onSelectTutorial}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Tutoriels à venir */}
      {comingSoonTutorials.length > 0 && (
        <section className="tutorials-section tutorials-section--coming-soon">
          <div className="container">
            <h2 className="tutorials-section__title">À Venir Très Bientôt</h2>
            <div className="tutorials-grid">
              {comingSoonTutorials.map(tutorial => (
                <div key={tutorial.id} className="tutorial-card tutorial-card--coming-soon">
                  <div className="tutorial-card__icon">
                    {tutorial.coverIcon}
                  </div>
                  <div className="tutorial-card__content">
                    <h3>{tutorial.title}</h3>
                    <p className="tutorial-card__description">
                      {tutorial.description}
                    </p>
                    <div className="tutorial-card__footer">
                      <span className="badge badge--coming-soon">À venir</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Categories Summary */}
      <section className="categories-section">
        <div className="container">
          <h2>Par Catégorie</h2>
          <div className="categories-grid">
            {categories.map(category => {
              const count = tutorials.filter(t => t.category === category).length
              return (
                <div key={category} className="category-card">
                  <h3>{category}</h3>
                  <p><strong>{count}</strong> tutoriel{count > 1 ? 's' : ''}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <p>
            Lords Mobile Academy – Créé par les joueurs, pour les joueurs.
          </p>
          <p className="footer-note">
            Inspiré par la communauté Lords Mobile. Aucun lien avec IGG Games.
          </p>
          <p className="footer-admin">
            <small>
              R4 ? <button 
                className="footer-admin__btn"
                onClick={() => {
                  const btn = document.querySelector('.admin-bar__toggle') as HTMLButtonElement
                  btn?.click()
                }}
                title="Ouvrir le panneau d'administration"
              >
                Accès administration
              </button>
            </small>
          </p>
        </div>
      </footer>
    </div>
  )
}
