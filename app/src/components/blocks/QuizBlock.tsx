import { useState } from 'react'
import './QuizBlock.css'

interface QuizBlockProps {
  question: string
  options: string[]
  correctAnswerIndex: number
  explanation: string
}

export default function QuizBlock({
  question,
  options,
  correctAnswerIndex,
  explanation
}: QuizBlockProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [showExplanation, setShowExplanation] = useState(false)

  const isCorrect = selectedIndex === correctAnswerIndex
  const hasAnswered = selectedIndex !== null

  const handleAnswer = (index: number) => {
    setSelectedIndex(index)
    setShowExplanation(true)
  }

  return (
    <div className="quiz-block">
      <h4 className="quiz-question">❓ {question}</h4>

      <div className="quiz-options">
        {options.map((option, idx) => (
          <button
            key={idx}
            className={`quiz-option ${
              hasAnswered
                ? idx === correctAnswerIndex
                  ? 'quiz-option--correct'
                  : idx === selectedIndex
                  ? 'quiz-option--incorrect'
                  : 'quiz-option--neutral'
                : 'quiz-option--selectable'
            }`}
            onClick={() => handleAnswer(idx)}
            disabled={hasAnswered}
          >
            <span className="quiz-option__indicator">
              {hasAnswered && idx === correctAnswerIndex && '✓'}
              {hasAnswered && idx === selectedIndex && idx !== correctAnswerIndex && '✗'}
              {!hasAnswered && '○'}
            </span>
            <span className="quiz-option__text">{option}</span>
          </button>
        ))}
      </div>

      {showExplanation && (
        <div className={`quiz-explanation ${isCorrect ? 'quiz-explanation--success' : 'quiz-explanation--error'}`}>
          <strong>{isCorrect ? '🎉 Bravo !' : '❌ Pas tout à fait'}</strong>
          <p>{explanation}</p>
          {!isCorrect && (
            <button
              className="btn btn-secondary btn-small"
              onClick={() => {
                setSelectedIndex(null)
                setShowExplanation(false)
              }}
            >
              Réessayer
            </button>
          )}
        </div>
      )}

      {!hasAnswered && (
        <p className="quiz-hint">Sélectionnez votre réponse</p>
      )}
    </div>
  )
}
