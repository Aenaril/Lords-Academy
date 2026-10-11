import { useAdmin } from './AdminContext'
import ImagePicker from './ImagePicker'
import ImageFramingEditor from './ImageFramingEditor'
import type { EditableBlock } from './types'
import type { ComparisonItem, ImageDisplaySettings } from '../data/tutorials'
import './BlockEditor.css'

interface BlockEditorProps {
  sectionUid: string
  block: EditableBlock
  onClose: () => void
}

/**
 * Éditeur inline par type de bloc. Rendu à la place du bloc en lecture
 * lorsque l'utilisateur clique sur le crayon.
 */
export default function BlockEditor({ sectionUid, block, onClose }: BlockEditorProps) {
  const { updateBlock } = useAdmin()

  const patch = (p: Partial<EditableBlock>) => updateBlock(sectionUid, block._uid, p)

  return (
    <div className="block-editor">
      <div className="block-editor__head">
        <span className="block-editor__type">✏️ Édition — bloc {block.type}</span>
        <button className="block-editor__done" onClick={onClose}>✓ Terminer</button>
      </div>

      {block.type === 'text' && (
        <label className="block-editor__field">
          <span>Paragraphe</span>
          <textarea
            rows={5}
            value={block.content}
            onChange={(e) => patch({ content: e.target.value })}
          />
        </label>
      )}

      {block.type === 'memo' && (
        <>
          <label className="block-editor__field block-editor__field--inline">
            <span>Icône</span>
            <input
              type="text"
              value={block.icon}
              maxLength={4}
              onChange={(e) => patch({ icon: e.target.value })}
            />
          </label>
          <label className="block-editor__field">
            <span>Titre</span>
            <input type="text" value={block.title} onChange={(e) => patch({ title: e.target.value })} />
          </label>
          <label className="block-editor__field">
            <span>Contenu</span>
            <textarea rows={3} value={block.content} onChange={(e) => patch({ content: e.target.value })} />
          </label>
        </>
      )}

      {(block.type === 'image' || block.type === 'hero-image') && (
        <>
          {block.type === 'hero-image' && (
            <label className="block-editor__field">
              <span>Titre superposé</span>
              <input type="text" value={block.heading ?? ''} onChange={(e) => patch({ heading: e.target.value })} />
            </label>
          )}
          {block.type === 'hero-image' && (
            <label className="block-editor__field">
              <span>Texte superposé</span>
              <textarea rows={3} value={block.content} onChange={(e) => patch({ content: e.target.value })} />
            </label>
          )}
          <div className="block-editor__field">
            <ImagePicker
              label="Image"
              value={block.imagePath}
              onChange={(imagePath) => patch({ imagePath })}
            />
          </div>
          <div className="block-editor__field">
            <span>Taille et cadrage</span>
            <ImageFramingEditor
              imagePath={block.imagePath}
              alt={block.alt}
              value={block.display}
              onChange={(display: ImageDisplaySettings) => patch({ display })}
            />
          </div>
          <label className="block-editor__field">
            <span>Texte alternatif (alt)</span>
            <input type="text" value={block.alt} onChange={(e) => patch({ alt: e.target.value })} />
          </label>
          <label className="block-editor__field">
            <span>Légende</span>
            <input type="text" value={block.caption ?? ''} onChange={(e) => patch({ caption: e.target.value })} />
          </label>
        </>
      )}

      {block.type === 'quiz' && (
        <>
          <label className="block-editor__field">
            <span>Question</span>
            <textarea rows={2} value={block.question} onChange={(e) => patch({ question: e.target.value })} />
          </label>
          <div className="block-editor__field">
            <span>Réponses (cochez la bonne)</span>
            {block.options.map((opt, i) => (
              <div key={i} className="block-editor__option">
                <input
                  type="radio"
                  name={`correct-${block._uid}`}
                  checked={block.correctAnswerIndex === i}
                  onChange={() => patch({ correctAnswerIndex: i })}
                  title="Marquer comme bonne réponse"
                />
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => {
                    const options = [...block.options]
                    options[i] = e.target.value
                    patch({ options })
                  }}
                />
                <button
                  className="block-editor__option-del"
                  title="Supprimer cette réponse"
                  disabled={block.options.length <= 2}
                  onClick={() => {
                    const options = block.options.filter((_, idx) => idx !== i)
                    const correctAnswerIndex =
                      block.correctAnswerIndex === i
                        ? 0
                        : block.correctAnswerIndex > i
                          ? block.correctAnswerIndex - 1
                          : block.correctAnswerIndex
                    patch({ options, correctAnswerIndex })
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              className="block-editor__add-option"
              onClick={() => patch({ options: [...block.options, `Réponse ${block.options.length + 1}`] })}
            >
              + Ajouter une réponse
            </button>
          </div>
          <label className="block-editor__field">
            <span>Explication</span>
            <textarea rows={2} value={block.explanation} onChange={(e) => patch({ explanation: e.target.value })} />
          </label>
        </>
      )}

      {block.type === 'comparison' && (
        <>
          <label className="block-editor__field">
            <span>Titre de la comparaison</span>
            <input type="text" value={block.title} onChange={(e) => patch({ title: e.target.value })} />
          </label>

          {block.items.map((item, i) => {
            const setItem = (p: Partial<ComparisonItem>) => {
              const items = block.items.map((it, idx) => (idx === i ? { ...it, ...p } : it))
              patch({ items })
            }
            const setList = (key: 'pros' | 'cons', list: string[]) => setItem({ [key]: list } as Partial<ComparisonItem>)

            return (
              <div key={i} className="block-editor__cmp-item">
                <div className="block-editor__cmp-head">
                  <strong>Élément {i + 1}</strong>
                  <button
                    className="block-editor__option-del"
                    title="Supprimer cet élément"
                    disabled={block.items.length <= 1}
                    onClick={() => patch({ items: block.items.filter((_, idx) => idx !== i) })}
                  >
                    ✕
                  </button>
                </div>
                <label className="block-editor__field">
                  <span>Nom</span>
                  <input type="text" value={item.name} onChange={(e) => setItem({ name: e.target.value })} />
                </label>
                <label className="block-editor__field">
                  <span>Description</span>
                  <input type="text" value={item.description} onChange={(e) => setItem({ description: e.target.value })} />
                </label>

                {(['pros', 'cons'] as const).map((key) => (
                  <div key={key} className="block-editor__field">
                    <span>{key === 'pros' ? '✓ Avantages' : '✗ Inconvénients'}</span>
                    {item[key].map((entry, k) => (
                      <div key={k} className="block-editor__option">
                        <input
                          type="text"
                          value={entry}
                          onChange={(e) => {
                            const list = [...item[key]]
                            list[k] = e.target.value
                            setList(key, list)
                          }}
                        />
                        <button
                          className="block-editor__option-del"
                          title="Supprimer"
                          onClick={() => setList(key, item[key].filter((_, idx) => idx !== k))}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                    <button
                      className="block-editor__add-option"
                      onClick={() => setList(key, [...item[key], key === 'pros' ? 'Nouvel avantage' : 'Nouvel inconvénient'])}
                    >
                      + Ajouter
                    </button>
                  </div>
                ))}
              </div>
            )
          })}

          <button
            className="block-editor__add-option"
            onClick={() =>
              patch({
                items: [
                  ...block.items,
                  { name: 'Nouvel élément', description: '', pros: ['Avantage'], cons: ['Inconvénient'] }
                ]
              })
            }
          >
            + Ajouter un élément de comparaison
          </button>
        </>
      )}
    </div>
  )
}
