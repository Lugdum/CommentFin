/**
 * Minimal i18n. Detects the browser's language (falls back to English) and
 * exposes `t(key)` to look up a string. To add a language: add a locale
 * object to STRINGS with the same keys as `en` - nothing else to change.
 * Admin-only surfaces (the plugin's Dashboard config page) are left in
 * English, matching Jellyfin's own convention for admin screens.
 */

const STRINGS = {
  en: {
    'common.close': 'Close',
    'common.cancel': 'Cancel',
    'common.yes': 'Yes',
    'common.no': 'No',

    'nav.comments': 'Comments',

    'settings.enableOverlay': 'Show comments',
    'settings.displayMode': 'Display mode',
    'settings.modeScroll': 'Scroll',
    'settings.modeFixedTop': 'Fixed at top',
    'settings.modeFixedBottom': 'Fixed at bottom',
    'settings.duration': 'On-screen duration',
    'settings.speed': 'Scroll speed',
    'settings.fontSize': 'Text size',
    'settings.opacity': 'Opacity',
    'settings.showAuthor': 'Show author',
    'settings.cardTheme': 'Bubble style',
    'settings.cardThemeDark': 'Dark',
    'settings.cardThemeLight': 'Light',
    'settings.composeOffset': 'Comment offset',
    'settings.composeShortcut': 'Shortcut to comment',
    'settings.manage': 'Manage my comments…',

    'manage.title': 'My comments',
    'manage.scopeItem': 'This media',
    'manage.scopeAll': 'All',
    'manage.scopeAdmin': 'Everyone (admin)',
    'manage.loading': 'Loading…',
    'manage.loadError': 'Failed to load.',
    'manage.emptyItem': "You haven't commented on this media.",
    'manage.emptyAll': "You haven't posted any comments yet.",
    'manage.emptyAdmin': 'No comments yet.',
    'manage.edit': 'Edit',
    'manage.delete': 'Delete',
    'manage.confirmDelete': 'Delete?',

    'compose.addTitle': 'Add a comment',
    'compose.placeholder': 'Your comment…',
    'compose.send': 'Send',
    'compose.errorRateLimited': 'Too many comments, try again later.',
    'compose.errorForbidden': 'Posting is restricted to administrators.',
    'compose.errorGeneric': 'Failed to send.',
  },
  fr: {
    'common.close': 'Fermer',
    'common.cancel': 'Annuler',
    'common.yes': 'Oui',
    'common.no': 'Non',

    'nav.comments': 'Commentaires',

    'settings.enableOverlay': 'Afficher les commentaires',
    'settings.displayMode': "Mode d'affichage",
    'settings.modeScroll': 'Défilement',
    'settings.modeFixedTop': 'Fixe en haut',
    'settings.modeFixedBottom': 'Fixe en bas',
    'settings.duration': "Durée d'affichage",
    'settings.speed': 'Vitesse de défilement',
    'settings.fontSize': 'Taille du texte',
    'settings.opacity': 'Opacité',
    'settings.showAuthor': "Afficher l'auteur",
    'settings.cardTheme': 'Style de la bulle',
    'settings.cardThemeDark': 'Sombre',
    'settings.cardThemeLight': 'Clair',
    'settings.composeOffset': 'Décalage du commentaire',
    'settings.composeShortcut': 'Raccourci pour commenter',
    'settings.manage': 'Gérer mes commentaires…',

    'manage.title': 'Mes commentaires',
    'manage.scopeItem': 'Ce média',
    'manage.scopeAll': 'Tous',
    'manage.scopeAdmin': 'Tout le monde (admin)',
    'manage.loading': 'Chargement…',
    'manage.loadError': 'Erreur de chargement.',
    'manage.emptyItem': 'Aucun commentaire de vous sur ce média.',
    'manage.emptyAll': "Vous n'avez encore posté aucun commentaire.",
    'manage.emptyAdmin': 'Aucun commentaire pour l’instant.',
    'manage.edit': 'Modifier',
    'manage.delete': 'Supprimer',
    'manage.confirmDelete': 'Supprimer ?',

    'compose.addTitle': 'Ajouter un commentaire',
    'compose.placeholder': 'Votre commentaire…',
    'compose.send': 'Envoyer',
    'compose.errorRateLimited': 'Trop de commentaires, réessaie plus tard.',
    'compose.errorForbidden': 'Publication réservée aux administrateurs.',
    'compose.errorGeneric': 'Échec de l’envoi.',
  },
};

const locale = pickLocale();

function pickLocale() {
  const candidates = (navigator.languages && navigator.languages.length
    ? navigator.languages
    : [navigator.language || 'en']
  ).map((l) => l.slice(0, 2).toLowerCase());
  return candidates.find((l) => STRINGS[l]) || 'en';
}

/** Looks up `key` in the detected locale, falling back to English, then the key itself. */
export function t(key) {
  return STRINGS[locale]?.[key] ?? STRINGS.en[key] ?? key;
}
