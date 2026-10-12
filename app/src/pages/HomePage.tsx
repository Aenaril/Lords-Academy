import { useState, useEffect } from 'react'
import { tutorials as staticTutorials, Tutorial } from '../data/tutorials'
import TutorialCard from '../components/TutorialCard'
import HeroSection from '../components/HeroSection'
import Header from '../components/Header'
import { openAdminLoginForm } from '../admin/AdminBarWrapper'
import './HomePage.css'

interface HomePageProps {
  onSelectTutorial: (tutorialId: string) => void
}

export default function HomePage({ onSelectTutorial }: HomePageProps) {
  const [tutorials, setTutorials] = useState<Tutorial[]>(staticTutorials)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Charger les tutoriels publiés depuis l'API au montage et à intervalle régulier
  useEffect(() => {
    const loadPublishedTutorials = async () => {
      try {
        const response = await fetch('/api/tutorials/published', {
          cache: 'no-store'
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        const data = await response.json()
        if (data.tutorials && Array.isArray(data.tutorials)) {
          // ✅ FUSION ROBUSTE : inclure tutoriels publiés + statiques, sans doublon
          const publishedMap = new Map(data.tutorials.map((t: any) => [t.id, t]))
          
          // Commencer avec les tutoriels statiques, remplacer par versions publiées si elles existent
          const merged: Tutorial[] = staticTutorials.map((staticTut: Tutorial) => 
            (publishedMap.get(staticTut.id) as Tutorial) || staticTut
          )
          
          // ✅ Ajouter tutoriels publiés qui n'existent pas dans la liste statique (dynamiques)
          for (const [id, publishedTut] of publishedMap) {
            if (!merged.some(t => t.id === id)) {
              merged.push(publishedTut as Tutorial)
            }
          }
          
          // Trier par ordre (tutoriels statiques + dynamiques)
          merged.sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
          
          setTutorials(merged)
          setLoadError(null)
        }
      } catch (err) {
        // Fallback : conserver la source statique
        console.warn('Erreur lors du chargement de l\'API tutoriels publiés:', err)
        setLoadError((err as any).message || 'Erreur réseau')
        setTutorials(staticTutorials)
      }
    }

    loadPublishedTutorials()

    // Recharger les tutoriels publiés toutes les 5 minutes
    const interval = setInterval(loadPublishedTutorials, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

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

      {/* Avertissement si l'index n'a pas pu être chargé */}
      {loadError && (
        <section className="error-section" style={{ backgroundColor: '#fff3cd', padding: '1rem', textAlign: 'center' }}>
          <p style={{ color: '#856404', margin: 0 }}>
            ⚠️ Impossible de charger le catalogue dynamique. Affichage du catalogue local.
          </p>
        </section>
      )}

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
                onClick={() => openAdminLoginForm()}
                title="Ouvrir le formulaire de connexion administration"
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
