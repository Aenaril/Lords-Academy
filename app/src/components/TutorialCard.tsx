import { Tutorial } from '../data/tutorials'
import { tutorialCoverImages } from '../data/tutorialImages'
import './TutorialCard.css'

const difficultyColors = {
  easy: '#4CAF50',
  medium: '#FFC107',
  hard: '#FF7043',
  expert: '#D32F2F'
}

const difficultyLabels = {
  easy: 'Facile',
  medium: 'Moyen',
  hard: 'Difficile',
  expert: 'Expert'
}

// Couleurs de dégradé pour chaque tutoriel
const tutorialGradients: { [key: string]: string } = {
  'attaque-defense': 'linear-gradient(135deg, #D84D00 0%, #FF6B35 100%)',
  'bataillons': 'linear-gradient(135deg, #3B6FA8 0%, #1E88E5 100%)',
  'dragon-arena': 'linear-gradient(135deg, #8B0000 0%, #D84D00 100%)',
  'epreuve-guilde': 'linear-gradient(135deg, #C41E3A 0%, #8B0000 100%)',
  'familiers-mono': 'linear-gradient(135deg, #FFB300 0%, #D4AF37 100%)',
  'phalanges-rangees': 'linear-gradient(135deg, #4A4A4A 0%, #1A1A1A 100%)',
  'regles-generales': 'linear-gradient(135deg, #3B6FA8 0%, #5E92B3 100%)',
  'techniques-avancees': 'linear-gradient(135deg, #4C0099 0%, #1A237E 100%)'
}

interface TutorialCardProps {
  tutorial: Tutorial
  onSelect: (tutorialId: string) => void
}

export default function TutorialCard({ tutorial, onSelect }: TutorialCardProps) {
  if (tutorial.status !== 'published') {
    return null
  }

  const gradient = tutorialGradients[tutorial.id] || 'linear-gradient(135deg, #2B2B2B 0%, #3B3B3B 100%)'
  const coverImage = tutorialCoverImages[tutorial.id]

  return (
    <div 
      className="tutorial-card" 
      onClick={() => onSelect(tutorial.id)}
    >
      {/* Image de couverture */}
      {coverImage && (
        <div className="tutorial-card__image-container">
          <img 
            src={coverImage}
            alt={tutorial.title}
            className="tutorial-card__image"
            loading="lazy"
          />
          <div className="tutorial-card__image-overlay" style={{ background: gradient }} />
        </div>
      )}
      
      <div className="tutorial-card__header" style={{ background: !coverImage ? gradient : 'transparent' }}>
        <div className="tutorial-card__icon">{tutorial.coverIcon}</div>
      </div>
      
      <div className="tutorial-card__content">
        <h3 className="tutorial-card__title">{tutorial.title}</h3>
        
        <p className="tutorial-card__description">
          {tutorial.description}
        </p>
        
        <div className="tutorial-card__meta">
          <div className="tutorial-card__stat">
            <span className="stat-icon">⏱️</span>
            <span>{tutorial.estimatedDuration} min</span>
          </div>
          <div 
            className="tutorial-card__difficulty"
            style={{ '--difficulty-color': difficultyColors[tutorial.difficulty] } as React.CSSProperties}
          >
            <span className="difficulty-dot"></span>
            {difficultyLabels[tutorial.difficulty]}
          </div>
        </div>
        
        <div className="tutorial-card__category">
          {tutorial.category}
        </div>
      </div>
      
      <div className="tutorial-card__cta">
        <span className="tutorial-card__arrow">→</span>
      </div>
    </div>
  )
}
