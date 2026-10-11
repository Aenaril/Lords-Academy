import { useEffect, useState } from 'react'
import { ContentBlock } from '../data/tutorials'
import TextBlock from './blocks/TextBlock'
import ImageBlock from './blocks/ImageBlock'
import HeroImageBlock from './blocks/HeroImageBlock'
import QuizBlock from './blocks/QuizBlock'
import ComparisonBlock from './blocks/ComparisonBlock'
import MemoBlock from './blocks/MemoBlock'
import './ContentBlock.css'

interface ContentBlockComponentProps {
  block: ContentBlock
}

export default function ContentBlockComponent({ block }: ContentBlockComponentProps) {
  const [isRevealed, setIsRevealed] = useState(false)

  // Animation de reveal au montage (corrigé : useEffect au lieu de setState-in-render)
  useEffect(() => {
    const t = setTimeout(() => setIsRevealed(true), 50)
    return () => clearTimeout(t)
  }, [])

  const blockClass = `content-block content-block--${block.type} ${isRevealed ? 'content-block--revealed' : ''}`

  switch (block.type) {
    case 'text':
      return (
        <div className={blockClass}>
          <TextBlock content={block.content} />
        </div>
      )
    case 'image':
      return (
        <div className={blockClass}>
          <ImageBlock
            imagePath={block.imagePath}
            caption={block.caption}
            alt={block.alt}
            display={block.display}
          />
        </div>
      )
    case 'hero-image':
      return (
        <div className={blockClass}>
          <HeroImageBlock
            imagePath={block.imagePath}
            alt={block.alt}
            heading={block.heading}
            content={block.content}
            align={block.align}
            caption={block.caption}
            display={block.display}
          />
        </div>
      )
    case 'quiz':
      return (
        <div className={blockClass}>
          <QuizBlock
            question={block.question}
            options={block.options}
            correctAnswerIndex={block.correctAnswerIndex}
            explanation={block.explanation}
          />
        </div>
      )
    case 'comparison':
      return (
        <div className={blockClass}>
          <ComparisonBlock
            title={block.title}
            items={block.items}
          />
        </div>
      )
    case 'memo':
      return (
        <div className={blockClass}>
          <MemoBlock
            title={block.title}
            content={block.content}
            icon={block.icon}
          />
        </div>
      )
    default:
      // Compatibilité ascendante : un type de bloc inconnu (ajouté par une
      // version plus récente) n'est plus ignoré silencieusement. On affiche un
      // repli neutre afin de ne jamais « perdre » de contenu à l'affichage.
      // Les 6 types actuels passent toujours par les cas ci-dessus : aucun
      // changement de rendu pour les tutoriels existants.
      return (
        <div className={blockClass}>
          <p className="content-block__unknown">
            Bloc non pris en charge par cette version de l'application.
          </p>
        </div>
      )
  }
}
