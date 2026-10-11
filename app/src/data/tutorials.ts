export interface Tutorial {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  estimatedDuration: string;
  coverIcon: string;
  status: 'published' | 'coming-soon' | 'draft';
  order: number;
  sections?: Section[];
}

export interface Section {
  id: string;
  title: string;
  /**
   * Traçabilité : numéro de la diapositive PowerPoint d'origine.
   * Doit être préservé même après modification par les administrateurs R4.
   */
  sourceSlide: number;
  /**
   * Titre original de la diapositive source (pour vérification de fidélité).
   */
  sourceTitle?: string;
  /**
   * Type de diapositive source : contenu pédagogique, couverture ou transition.
   */
  slideType?: 'content' | 'cover' | 'transition' | 'recap';
  /**
   * Image de fond immersive de la section. Lorsqu'elle est définie, l'image est
   * estompée en arrière-plan et tous les blocs se superposent par-dessus,
   * ce qui compacte la page.
   */
  backgroundImage?: string;
  /**
   * Cadrage de l'image de fond (position + mode). Seuls `posX`, `posY` et `fit`
   * sont pertinents pour un fond CSS ; les autres champs sont ignorés ici.
   */
  backgroundDisplay?: ImageDisplaySettings;
  blocks: ContentBlock[];
}

export interface TextBlock {
  type: 'text';
  content: string;
}

/**
 * Paramètres d'affichage (cadrage) d'une image. On ne modifie JAMAIS l'image
 * originale : ces réglages ne décrivent que sa présentation (ratio du cadre,
 * largeur, mode cover/contain, position et zoom). Rendus en CSS pur
 * (object-fit / object-position / scale), compatibles responsive.
 */
export interface ImageDisplaySettings {
  /** Forme du cadre. 'custom' utilise `customHeight`. 'auto' = ratio naturel. */
  aspect?: 'auto' | 'banner' | '16:9' | '4:3' | '1:1' | 'custom';
  /** Hauteur en pixels lorsque aspect === 'custom'. */
  customHeight?: number;
  /** Largeur du bloc dans la colonne de contenu. */
  width?: 'compact' | 'normal' | 'full';
  /** Mode de remplissage : couvrir (recadrer) ou contenir (tout visible). */
  fit?: 'cover' | 'contain';
  /** Position horizontale du cadrage en % (0 = gauche, 100 = droite). */
  posX?: number;
  /** Position verticale du cadrage en % (0 = haut, 100 = bas). */
  posY?: number;
  /** Zoom (1 = taille d'origine). */
  zoom?: number;
}

export interface ImageBlock {
  type: 'image';
  imagePath: string;
  caption?: string;
  alt: string;
  display?: ImageDisplaySettings;
}

export interface HeroImageBlock {
  type: 'hero-image';
  imagePath: string;
  alt: string;
  /** Titre superposé (optionnel). */
  heading?: string;
  /** Texte principal superposé sur l'image. */
  content: string;
  /** Position du texte sur l'image. */
  align?: 'left' | 'center' | 'right';
  /** Légende sous l'image (optionnelle). */
  caption?: string;
  display?: ImageDisplaySettings;
}

export interface QuizBlock {
  type: 'quiz';
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

export interface ComparisonBlock {
  type: 'comparison';
  title: string;
  items: ComparisonItem[];
}

export interface ComparisonItem {
  name: string;
  description: string;
  pros: string[];
  cons: string[];
}

export interface MemoBlock {
  type: 'memo';
  title: string;
  content: string;
  icon: string;
}

export type ContentBlock = 
  | TextBlock 
  | ImageBlock
  | HeroImageBlock
  | QuizBlock 
  | ComparisonBlock 
  | MemoBlock;

export const tutorials: Tutorial[] = [
  {
    id: 'attaque-defense',
    title: 'Attaque et Défense',
    description: 'Maîtrisez les compositions offensives et défensives pour les fillers et Rally Leaders.',
    category: 'Combats',
    difficulty: 'medium',
    estimatedDuration: '8-10',
    coverIcon: '⚔️',
    status: 'coming-soon',
    order: 1
  },
  {
    id: 'bataillons',
    title: 'Bataillons',
    description: 'Configuration des bataillons et les 8 formations essentielles.',
    category: 'Formations',
    difficulty: 'medium',
    estimatedDuration: '10-12',
    coverIcon: '🏟️',
    status: 'coming-soon',
    order: 2
  },
  {
    id: 'dragon-arena',
    title: 'Dragon Arena',
    description: 'Comprenez les rôles clés et dominez cet événement intense.',
    category: 'Événements',
    difficulty: 'hard',
    estimatedDuration: '12-15',
    coverIcon: '🐉',
    status: 'published',
    order: 3
  },
  {
    id: 'epreuve-guilde',
    title: 'Épreuve de Guilde',
    description: 'Stratégies et compositions pour les combats de guilde.',
    category: 'Événements',
    difficulty: 'hard',
    estimatedDuration: '10-12',
    coverIcon: '⚔️',
    status: 'coming-soon',
    order: 4
  },
  {
    id: 'familiers-mono',
    title: 'Familiers pour Attaques Mono',
    description: 'Guide complet des familiers par spécialité.',
    category: 'Héros',
    difficulty: 'medium',
    estimatedDuration: '10',
    coverIcon: '🐾',
    status: 'coming-soon',
    order: 5
  },
  {
    id: 'phalanges-rangees',
    title: 'Phalanges et Rangées',
    description: 'Comprendre les formations avancées et les counters.',
    category: 'Stratégie',
    difficulty: 'expert',
    estimatedDuration: '15-20',
    coverIcon: '🛡️',
    status: 'coming-soon',
    order: 6
  },
  {
    id: 'regles-generales',
    title: 'Règles Générales',
    description: 'Règles essentielles des Rally Wars et coordination.',
    category: 'Combats',
    difficulty: 'medium',
    estimatedDuration: '12-15',
    coverIcon: '📋',
    status: 'coming-soon',
    order: 7
  },
  {
    id: 'techniques-avancees',
    title: 'Techniques Avancées',
    description: 'Stratégies d\'élite: boozle, timing, gestion avancée.',
    category: 'Stratégie',
    difficulty: 'expert',
    estimatedDuration: '12-15',
    coverIcon: '🎯',
    status: 'coming-soon',
    order: 8
  }
];

// Dragon Arena - tutoriel complet pour le prototype
export const dragonArenaTutorial: Tutorial = {
  id: 'dragon-arena',
  title: 'Dragon Arena: Comment Jouer',
  description: 'Dominez la Dragon Arena en comprenant les rôles clés et les stratégies gagnantes.',
  category: 'Événements',
  difficulty: 'hard',
  estimatedDuration: '12-15',
  coverIcon: '🐉',
  status: 'published',
  order: 3,
  sections: [
    // ───────────────────────────────────────────────
    // SECTION 1 ⇄ DIAPOSITIVE 1 (couverture)
    // Titre original : "🏰 Dragon Arena: comment jouer?"
    // ───────────────────────────────────────────────
    {
      id: 'intro',
      title: 'Dragon Arena : comment jouer ?',
      sourceSlide: 1,
      sourceTitle: '🏰 Dragon Arena: comment jouer?',
      slideType: 'cover',
      blocks: [
        {
          type: 'text',
          content: 'Comprendre les rôles clés pour dominer la caravane et tenir les bâtiments stratégiques. Chaque membre compte — des RLs volants aux fillers !'
        } as TextBlock,
        {
          type: 'image',
          imagePath: '/images/content/dragon-arena/16.jpeg',
          alt: 'Visuel immersif de la Dragon Arena',
          caption: 'Dragon Arena : un affrontement de guilde où chaque rôle est décisif'
        } as ImageBlock,
        {
          type: 'image',
          imagePath: '/images/content/dragon-arena/15.jpeg',
          alt: 'Carte de Dragon Arena avec zones stratégiques',
          caption: 'La carte de la Dragon Arena : sources chaudes, vestiges antiques et autel du dragon'
        } as ImageBlock,
        {
          type: 'text',
          content: 'Dans ce guide, vous découvrirez les trois rôles clés de l\'événement :\n• Les RLs volants (caravanes)\n• Les RLs fixes (tenue des forts)\n• Les fillers (soutien indispensable)'
        } as TextBlock
      ]
    },
    // ───────────────────────────────────────────────
    // SECTION 2 ⇄ DIAPOSITIVE 2
    // Titre original : "⚡ Les RLs Volants (Caravanes)"
    // ───────────────────────────────────────────────
    {
      id: 'rls-volants',
      title: 'Les RLs Volants (Caravanes)',
      sourceSlide: 2,
      sourceTitle: '⚡ Les RLs Volants (Caravanes)',
      slideType: 'content',
      blocks: [
        {
          type: 'text',
          content: 'Les RLs volants sont des joueurs mobiles qui sautent de bâtiment en bâtiment pour déloger l\'adversaire et permettre la capture d\'une caravane (bonus de points). Leur objectif : prendre le bâtiment juste à temps avant que la caravane n\'y passe.'
        } as TextBlock,
        {
          type: 'image',
          imagePath: '/images/content/dragon-arena/17.jpeg',
          alt: 'Combat épique en Dragon Arena',
          caption: 'Les RLs volants mènent l\'assaut : réactivité et improvisation sont leurs maîtres-mots'
        } as ImageBlock,
        {
          type: 'memo',
          title: 'Réactivité maximale',
          content: 'Peu de temps pour demander une compo dans le tchat — ils doivent évaluer et décider vite.',
          icon: '⚡'
        } as MemoBlock,
        {
          type: 'memo',
          title: 'Course contre la montre',
          content: 'En permanence sous pression : la caravane avance de fort en fort avec des temps de déplacement variables.',
          icon: '⏱️'
        } as MemoBlock,
        {
          type: 'memo',
          title: 'Adaptation rapide',
          content: 'Ils doivent calculer leur approche et composition d\'attaque à chaque bâtiment ciblé.',
          icon: '🎯'
        } as MemoBlock,
        {
          type: 'quiz',
          question: 'Quel est l\'objectif principal d\'un RL volant en Dragon Arena ?',
          options: [
            'Remplir les rallys des autres joueurs',
            'Prendre le bâtiment juste à temps avant le passage de la caravane',
            'Rester posté sur un seul fort toute la partie',
            'Collecter les troupes des fillers'
          ],
          correctAnswerIndex: 1,
          explanation: 'Le RL volant saute de bâtiment en bâtiment pour déloger l\'adversaire et permettre la capture de la caravane, qui apporte un bonus de points. Il doit prendre le bâtiment juste avant que la caravane n\'y passe.'
        } as QuizBlock
      ]
    },
    // ───────────────────────────────────────────────
    // SECTION 3 ⇄ DIAPOSITIVE 3
    // Titre original : "⚠️ Contraintes des RLs Volants"
    // ───────────────────────────────────────────────
    {
      id: 'contraintes-rls-volants',
      title: 'Contraintes des RLs Volants',
      sourceSlide: 3,
      sourceTitle: '⚠️ Contraintes des RLs Volants',
      slideType: 'content',
      blocks: [
        {
          type: 'text',
          content: 'Du fait de leur mobilité permanente, les RLs volants ne peuvent pas fill/full les RW d\'autres joueurs. Ils sont entièrement dédiés à la progression de la caravane et n\'ont pas la disponibilité pour soutenir les rallys fixes.'
        } as TextBlock,
        {
          type: 'memo',
          title: 'Pas de fill RW',
          content: 'Mobilité totale = impossible de remplir les rallys des autres.',
          icon: '🚫'
        } as MemoBlock,
        {
          type: 'memo',
          title: 'Temps limité',
          content: 'Chaque décision doit être prise en quelques secondes seulement.',
          icon: '⏱️'
        } as MemoBlock,
        {
          type: 'quiz',
          question: 'Pourquoi un RL volant ne peut-il pas remplir les rallys des autres joueurs ?',
          options: [
            'Parce que c\'est interdit par les règles de l\'événement',
            'Parce que sa mobilité permanente l\'en empêche',
            'Parce qu\'il n\'a pas assez de troupes',
            'Parce que les fillers s\'en chargent déjà'
          ],
          correctAnswerIndex: 1,
          explanation: 'Sa mobilité totale le rend entièrement dédié à la progression de la caravane. Il n\'a donc pas la disponibilité pour soutenir les rallys fixes des autres joueurs.'
        } as QuizBlock
      ]
    },
    // ───────────────────────────────────────────────
    // SECTION 4 ⇄ DIAPOSITIVE 4
    // Titre original : "🛡️ Les RLs Fixes — Tenir les forts"
    // ───────────────────────────────────────────────
    {
      id: 'rls-fixes',
      title: 'Les RLs Fixes — Tenir les forts',
      sourceSlide: 4,
      sourceTitle: '🛡️ Les RLs Fixes — Tenir les forts',
      slideType: 'content',
      backgroundImage: '/images/content/dragon-arena/18.jpeg',
      blocks: [
        {
          type: 'text',
          content: 'Les forts offrent des points lorsqu\'ils sont tenus, mais aussi des stats boostant l\'attaque de toute l\'équipe, des téléportations ou des boosts de vitesse de soin. Ils sont absolument prioritaires et doivent être tenus le plus longtemps possible par des RLs fixes capables de résister à des assauts lourds et répétés.'
        } as TextBlock,
        {
          type: 'comparison',
          title: 'Les 5 bâtiments à tenir et leurs bonus',
          items: [
            {
              name: 'Citadelle',
              description: 'Le bâtiment le plus précieux après les caravanes.',
              pros: ['Délivre le plus de points (hors caravanes)'],
              cons: ['Cible prioritaire de l\'adversaire']
            },
            {
              name: 'Sources chaudes',
              description: 'Bâtiment à fort rendement avec bonus de soin.',
              pros: ['Pas mal de points', 'Boost 50% vitesse de soin'],
              cons: ['Convoitée par les deux camps']
            },
            {
              name: 'Vestiges antiques',
              description: 'Bâtiment offensif pour toute la guilde.',
              pros: ['Pas mal de points', 'Boost 50% ATK armée pour toute la guilde'],
              cons: ['Doit être défendu en priorité']
            },
            {
              name: 'Transporteur',
              description: 'Bâtiment utilitaire de mobilité.',
              pros: ['Un peu de points', 'Octroie des transporteurs'],
              cons: ['Rendement en points limité']
            },
            {
              name: 'Avant-poste',
              description: 'Petit bâtiment de contrôle de zone.',
              pros: ['Facile à occuper'],
              cons: ['Délivre très peu de points']
            }
          ]
        } as ComparisonBlock,
        {
          type: 'quiz',
          question: 'Quel bâtiment offre un boost de 50% ATK armée à toute la guilde ?',
          options: [
            'La Citadelle',
            'Les Sources chaudes',
            'Les Vestiges antiques',
            'L\'Avant-poste'
          ],
          correctAnswerIndex: 2,
          explanation: 'Les Vestiges antiques délivrent pas mal de points ET offrent un boost de 50% d\'attaque d\'armée à toute la guilde. Les Sources chaudes, elles, donnent un boost de 50% de vitesse de soin.'
        } as QuizBlock
      ]
    },
    // ───────────────────────────────────────────────
    // SECTION 5 ⇄ DIAPOSITIVE 5
    // Titre original : "⚠️ Fillers — TOUT AUSSI IMPORTANTS !"
    // ───────────────────────────────────────────────
    {
      id: 'fillers',
      title: 'Fillers — TOUT AUSSI IMPORTANTS !',
      sourceSlide: 5,
      sourceTitle: '⚠️ Fillers — TOUT AUSSI IMPORTANTS !',
      slideType: 'content',
      backgroundImage: '/images/content/dragon-arena/19.jpeg',
      blocks: [
        {
          type: 'text',
          content: 'Les membres non attribués à un bâtiment sont indispensables : pas de rally sans RL, et pas de RL sans fillers !'
        } as TextBlock,
        {
          type: 'memo',
          title: '1 — Remplir les rallys',
          content: 'Remplir les rallys avec sceaux si possible + stuff speed.',
          icon: '1️⃣'
        } as MemoBlock,
        {
          type: 'memo',
          title: '2 — Refill des forts',
          content: 'Refill et remplissage des forts dans le besoin (sans les FULL !).',
          icon: '2️⃣'
        } as MemoBlock,
        {
          type: 'memo',
          title: '3 — Speeder les troupes',
          content: 'Speeder vos troupes ou demander de l\'aide pour les bottes ! Tout retard peut engendrer la perte d\'une caravane !',
          icon: '3️⃣'
        } as MemoBlock,
        {
          type: 'quiz',
          question: 'Comment un filler doit-il gérer le remplissage des forts ?',
          options: [
            'Remplir complètement (FULL) chaque fort',
            'Refill selon le besoin, sans jamais les remplir complètement',
            'Ne jamais toucher aux forts',
            'Attendre que le RL volant le fasse'
          ],
          correctAnswerIndex: 1,
          explanation: 'Le filler refill et remplit les forts selon le besoin, mais sans jamais les FULL. Remplir complètement un fort gaspille les troupes nécessaires ailleurs.'
        } as QuizBlock
      ]
    },
    // ───────────────────────────────────────────────
    // SECTION 6 ⇄ DIAPOSITIVE 6 (récapitulatif)
    // Titre original : "✅ Bref: CHAQUE ROLE COMPTE!"
    // ───────────────────────────────────────────────
    {
      id: 'recap',
      title: 'Bref : CHAQUE RÔLE COMPTE !',
      sourceSlide: 6,
      sourceTitle: '✅ Bref: CHAQUE ROLE COMPTE!',
      slideType: 'recap',
      blocks: [
        {
          type: 'comparison',
          title: 'Les trois rôles, un seul objectif',
          items: [
            {
              name: 'RLs Volants',
              description: 'Mobilité, rapidité, improvisation.',
              pros: ['Délogent l\'adversaire', 'Ouvrent la voie à la caravane'],
              cons: ['Pas de fill RW', 'Décisions en quelques secondes']
            },
            {
              name: 'RLs Fixes',
              description: 'Tenir les bâtiments capitaux.',
              pros: ['Conservent points et bonus d\'équipe', 'Résistent aux assauts lourds'],
              cons: ['Cibles prioritaires', 'Doivent tenir le plus longtemps possible']
            },
            {
              name: 'Fillers',
              description: 'Le moteur invisible de chaque victoire.',
              pros: ['Remplissent les rallys', 'Refill et speed'],
              cons: ['Rôle de l\'ombre', 'Tout retard peut coûter une caravane']
            }
          ]
        } as ComparisonBlock,
        {
          type: 'memo',
          title: 'À retenir',
          content: 'Pas de rally sans RL, et pas de RL sans fillers. Mobilité des volants, résistance des fixes, soutien des fillers : chaque rôle est un maillon de la victoire. 🐉',
          icon: '🏆'
        } as MemoBlock
      ]
    }
  ]
};
