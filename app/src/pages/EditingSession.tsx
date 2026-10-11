/**
 * EditingSession : Composant isolé pour chaque tutoriel
 * 
 * Utilise la clé React pour garantir que chaque tutorialId obtient :
 * - Un nouvel AdminContext
 * - Un reset complet des states (tutorial, isDirty, undoStack, versions)
 * - Une sauvegarde indépendante du brouillon
 * 
 * Cela élimine les race conditions et les contaminatins entre tutoriels.
 */

import TutorialPage from './TutorialPage'
import { AdminProvider } from '../admin/AdminContext'

interface EditingSessionProps {
  tutorialId: string
  onReturnHome: () => void
}

export default function EditingSession({ tutorialId, onReturnHome }: EditingSessionProps) {
  return (
    <AdminProvider key={tutorialId} tutorialId={tutorialId}>
      <TutorialPage tutorialId={tutorialId} onReturnHome={onReturnHome} />
    </AdminProvider>
  )
}
