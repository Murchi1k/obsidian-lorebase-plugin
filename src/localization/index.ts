/**
 * LOREBASE - Localization System
 * Multi-language support with type-safe translation keys
 */

import { Language } from '../types';

// =============================================================================
// TRANSLATION KEYS TYPE
// =============================================================================

/** All available translation keys */
export type TranslationKey =
    // Statuses
    | 'statusPlayed' | 'statusPlaying' | 'statusDropped' | 'statusSandbox'
    | 'statusNotStarted' | 'statusFavorite'
    | 'statusPlanned' | 'statusWatching' | 'statusCompleted' | 'statusPaused'
    // UI elements
    | 'search' | 'searchPlaceholder'
    | 'sort' | 'sortName' | 'sortRating' | 'sortYear' | 'sortDateCompleted' | 'sortOrder' | 'sortAsc' | 'sortDesc'
    | 'sortDateWatched'
    | 'status' | 'filter' | 'filterAdult' | 'filterFlags' | 'tags' | 'genres' | 'plans' | 'tagsEmpty' | 'view'
    | 'random' | 'randomAnime' | 'stats' | 'settings' | 'commandSteamSync'
    // View modes
    | 'viewGrid' | 'viewHorizontal'
    // Display modes
    | 'modeCustom'
    // Settings
    | 'settingsColumns' | 'settingsCardSize'
    | 'settingsCustomCardSize' | 'settingsCustomCardSizeDesc'
    | 'settingsCardMinWidth' | 'settingsCardMinHeight' | 'settingsCardImageRatio'
    | 'settingsHorizontalCardMinWidth' | 'settingsHorizontalCardHeight'
    | 'settingsCardMinWidthDesc' | 'settingsCardMinHeightDesc' | 'settingsCardImageRatioDesc'
    | 'settingsHorizontalCardMinWidthDesc' | 'settingsHorizontalCardHeightDesc'
    | 'settingsCustomCardReset'
    | 'settingsAnimeSeasonProgress' | 'settingsAnimeEpisodeProgress'
    | 'settingsSizeSmall' | 'settingsSizeMedium' | 'settingsSizeLarge'
    | 'settingsOrientation' | 'settingsOrientationVertical' | 'settingsOrientationHorizontal'
    | 'settingsColor' | 'settingsLanguage' | 'settingsReset'
    | 'settingsMediaGames' | 'settingsMediaAnime'
    | 'settingsParticle' | 'settingsParticleNone' | 'settingsParticleSakura' | 'settingsParticleSnow' | 'settingsParticleIntensity'
    | 'settingsFolder' | 'settingsGames' | 'settingsComingSoon' | 'settingsExperiment'
    | 'settingsTitle' | 'settingsSupportTitle' | 'settingsSupportDesc' | 'settingsSupportUnavailable'
    | 'settingsDangerZone' | 'settingsResetAllButton'
    | 'settingsComingSoonMoviesText' | 'settingsComingSoonBooksText'
    | 'settingsAnime'
    | 'settingsGeneral' | 'settingsShowAdult'
    | 'settingsBadges'
    | 'settingsPreviewMode' | 'settingsPreviewGame' | 'settingsPreviewAnime'
    | 'settingsDescriptionLines' | 'settingsDescriptionLinesDesc'
    | 'settingsBadgesStatus' | 'settingsBadgesRating' | 'settingsBadgesFavorite'
    | 'settingsBadgesStatusPosition' | 'settingsBadgesRatingPosition' | 'settingsBadgesFavoritePosition'
    | 'settingsBadgesStatusIconOnly'
    | 'settingsBadgesFavoritePulse'
    | 'settingsBadgesRatingMode' | 'settingsBadgesRatingModeStar' | 'settingsBadgesRatingModeEmoji'
    | 'settingsBadgesEditorHint'
    | 'settingsOverlayHint' | 'settingsOverlayReadoutIdle'
    | 'settingsOverlayApplyAllMedia' | 'settingsOverlayApplyAllMediaDesc'
    | 'settingsBadgesPosition'
    | 'settingsBadgesPosTopLeft' | 'settingsBadgesPosTopRight' | 'settingsBadgesPosBottomLeft' | 'settingsBadgesPosBottomRight'
    | 'settingsDescLanguage' | 'settingsDescColor' | 'settingsDescFolder'
    | 'settingsDescColumns' | 'settingsDescOrientation' | 'settingsDescShowAdult' | 'settingsDescReset'
    | 'settingsIntegrations' | 'settingsIntegrationsEnable' | 'settingsIntegrationsEnableDesc'
    | 'settingsIntegrationsProviders' | 'settingsIntegrationsMediaProviders' | 'settingsIntegrationsTemplates'
    | 'settingsIntegrationsProviderRawg' | 'settingsIntegrationsProviderSteam' | 'settingsIntegrationsProviderIgdb'
    | 'settingsIntegrationsProviderAnilist' | 'settingsIntegrationsProviderShikimori'
    | 'settingsIntegrationsProviderKeyRequired' | 'settingsIntegrationsProviderKeyOptional'
    | 'settingsIntegrationsProviderKeyPlaceholder'
    | 'settingsIntegrationsProviderClientIdPlaceholder' | 'settingsIntegrationsProviderClientSecretPlaceholder'
    | 'settingsIntegrationsProviderIgdbHelpTitle' | 'settingsIntegrationsProviderIgdbHelpText'
    | 'settingsIntegrationsProviderIgdbTwitchLink' | 'settingsIntegrationsProviderIgdbDocsLink'
    | 'settingsIntegrationsProviderTest'
    | 'settingsIntegrationsImageStorage' | 'settingsIntegrationsImageStorageDesc'
    | 'settingsIntegrationsImageStorageEnable' | 'settingsIntegrationsImageStorageEnableDesc'
    | 'settingsIntegrationsImageStorageFolder' | 'settingsIntegrationsImageStorageFolderDesc'
    | 'settingsIntegrationsImageStorageDownloadExisting' | 'settingsIntegrationsImageStorageDownloadExistingDesc'
    | 'settingsIntegrationsImageStorageDownloadStarted' | 'settingsIntegrationsImageStorageDownloadDone'
    | 'settingsIntegrationsGamesProvider' | 'settingsIntegrationsAnimeProvider'
    | 'settingsIntegrationsGamesTemplate' | 'settingsIntegrationsAnimeTemplate'
    | 'settingsIntegrationsTemplateContent' | 'settingsIntegrationsTemplateDesc'
    | 'settingsIntegrationsGamesProviderDesc' | 'settingsIntegrationsAnimeProviderDesc'
    | 'settingsIntegrationsGamesTemplateDesc' | 'settingsIntegrationsAnimeTemplateDesc'
    | 'settingsIntegrationsTemplateMode' | 'settingsIntegrationsTemplateModeDesc'
    | 'settingsIntegrationsTemplateModeSimple' | 'settingsIntegrationsTemplateModeAdvanced'
    | 'settingsIntegrationsTemplateFields' | 'settingsIntegrationsHowLongToBeat' | 'settingsIntegrationsHowLongToBeatDesc'
    | 'templateFieldName' | 'templateFieldImage' | 'templateFieldImageHorizontal'
    | 'templateFieldPoster' | 'templateFieldPosterHorizontal' | 'templateFieldPlot'
    | 'templateFieldScoreImdb' | 'templateFieldTags' | 'templateFieldYear' | 'templateFieldStudios'
    | 'templateFieldFormat' | 'templateFieldRating' | 'templateFieldStatus' | 'templateFieldDropped'
    | 'templateFieldFavorite' | 'templateFieldUrl' | 'templateFieldGameSeries' | 'templateFieldGenres'
    | 'templateFieldPlatforms' | 'templateFieldReleased' | 'templateFieldDevelopers' | 'templateFieldPublishers'
    | 'templateFieldMetacritic' | 'templateFieldUserRating' | 'templateFieldPlayed' | 'templateFieldPlaying'
    | 'templateFieldAnimeParts' | 'templateFieldIntegrationSource'
    | 'templateFieldMain' | 'templateFieldMainPlusSides' | 'templateFieldCompletionist'
    | 'editProgressMain' | 'editProgressMainPlusSides' | 'editProgressPerfectionist' | 'commonNoData'
    | 'resetTitle' | 'resetSubtitle' | 'resetWarning' | 'resetConfirm' | 'resetConfirmAck'
    // Statistics
    | 'statsTitle' | 'statsTotal' | 'statsCompleted' | 'statsAvgRating' | 'statsOf'
    | 'statsDistribution' | 'statsRatingDistribution' | 'statsAdditionalInfo'
    | 'statsSeries' | 'statsCustomPosters' | 'statsAdultContent'
    | 'statsRated' | 'statsCompletionPercent'
    // Ratings
    | 'ratingAwesome' | 'ratingGood' | 'ratingOkay' | 'ratingWeak' | 'ratingBad'
    // Misc
    | 'year' | 'yearNotSpecified' | 'noDescription' | 'noSeries'
    | 'randomGame' | 'noGamesFound'
    // Context menu
    | 'contextChangeStatus' | 'contextChangeRating' | 'contextAddFavorite'
    | 'contextRemoveFavorite' | 'contextEdit' | 'contextDelete' | 'contextClear'
    | 'contextEpisodePlusOne'
    | 'contextGames' | 'contextAnime'
    // Edit modal
    | 'editRating' | 'editStatus' | 'editFavorite' | 'editYear'
    | 'editDescription' | 'editSeries' | 'editNoSeries' | 'editAdult' | 'editCustomPoster'
    | 'editSave' | 'editCancel' | 'editProgress' | 'editCompletedOn'
    | 'editDetails' | 'editAdvanced' | 'editClear'
    | 'editSeasonCurrent' | 'editEpisodeCurrent' | 'editEpisodeTotal'
    | 'editSeasonTotal' | 'editFormat' | 'editSummary' | 'editUrl' | 'editEpisodeInc'
    | 'editEnabled' | 'editDisabled'
    | 'editPoster' | 'editQuickSettings' | 'editTracking'
    | 'editPersonalRating' | 'editRatingHint' | 'editSaved' | 'editUnsavedChanges'
    | 'editCharsShort' | 'editReleaseDate' | 'editPublisher' | 'editDeveloper'
    | 'editLocalPath' | 'editOpen' | 'editTagPlaceholder'
    | 'editDates' | 'editAdded' | 'editUpdated' | 'editUnknown'
    | 'editOverflow' | 'editRemoveHint' | 'editBreadcrumbGames' | 'editBreadcrumbAnime'
    | 'editAnimeParts' | 'editAddPart' | 'editRemovePart' | 'editCannotRemoveLastPart'
    | 'editTotalEpisodes' | 'editActivePart'
    | 'animePartsCheck' | 'animePartsProviderTitle' | 'animePartsNew' | 'animePartsSelected'
    | 'animePartsNoNew' | 'animePartsSourceMissing' | 'animePartsApply'
    | 'planCheckLater' | 'planPlaySoon' | 'planWaitEarlyAccess' | 'planNextInQueue'
    | 'settingsStatusPlans' | 'settingsStatusPlansDesc' | 'settingsGameStatusLabels'
    | 'settingsAnimeStatusLabels' | 'settingsGamePlanTags' | 'settingsGamePlanTagsDesc'
    | 'formatTv' | 'formatMovie' | 'formatOva' | 'formatOna' | 'formatSpecial'
    // Delete modal
    | 'deleteTitle' | 'deleteSubtitle' | 'deleteWarning' | 'deleteConfirmAck' | 'deleteConfirm' | 'deleteCancel'
    | 'deleteTitleAnime' | 'deleteSubtitleAnime' | 'deleteConfirmAckAnime'
    // Notifications
    | 'notifyLoading'
    | 'commandOpenLibrary' | 'commandAddGame' | 'commandAddAnime'
    | 'ribbonLibrary'
    | 'errorInitView' | 'errorLoadingItems' | 'errorProcessingList'
    | 'promptSearchGame' | 'promptSearchAnime' | 'promptSearchPlaceholder'
    | 'promptSelectResult'
    | 'promptSearchAction' | 'promptAddSelected' | 'promptSelectedLabel'
    | 'promptReviewSelected' | 'promptReviewSelectedSubtitle' | 'promptConfirmSelected' | 'promptRemoveSelected'
    | 'promptAddAnotherTitle' | 'promptAddAnotherBodyGame' | 'promptAddAnotherBodyAnime'
    | 'promptAddAnotherYes' | 'promptAddAnotherNo'
    | 'noticeNoResults' | 'noticeMissingApiKey' | 'noticeProviderDisabled' | 'noticeIntegrationsDisabled'
    | 'noticeCreated' | 'noticeSkipped'
    | 'noticeProviderTestSuccess' | 'noticeProviderTestFail'
    | 'noticeIntegrationsError'
    | 'promptFileExistsTitle' | 'promptFileExistsBody' | 'promptFileExistsUpdate' | 'promptFileExistsSkip'
    | 'commonOk' | 'commonCancel' | 'commonBack';

// =============================================================================
// TRANSLATIONS
// =============================================================================

/** English translations */
const EN: Record<TranslationKey, string> = {
    // Statuses
    statusPlayed: 'Completed',
    statusPlaying: 'Playing',
    statusDropped: 'Dropped',
    statusSandbox: 'Sandbox',
    statusNotStarted: 'Not started',
    statusFavorite: 'Favorite',
    statusPlanned: 'Planned',
    statusWatching: 'Watching',
    statusCompleted: 'Completed',
    statusPaused: 'Paused',

    // UI elements
    search: 'Search',
    searchPlaceholder: 'Search...',
    sort: 'Sort',
    sortName: 'Name',
    sortRating: 'Rating',
    sortYear: 'Year',
    sortDateCompleted: 'Date completed',
    sortDateWatched: 'Date watched',
    sortOrder: 'Order',
    sortAsc: 'Asc',
    sortDesc: 'Desc',
    status: 'Status',
    filter: 'Filter',
    filterAdult: 'Adult (18+)',
    filterFlags: 'Flags',
    tags: 'Tags',
    genres: 'Genres',
    plans: 'Plans',
    tagsEmpty: 'No tags yet',
    view: 'View',
    random: 'Random game',
    randomAnime: 'Random anime',
    stats: 'Statistics',
    settings: 'Settings',

    // View modes
    viewGrid: 'Vertical',
    viewHorizontal: 'Horizontal',

    // Display modes
    modeCustom: 'Custom covers',

    // Settings
    settingsColumns: 'Columns',
    settingsCardSize: 'Card size',
    settingsCustomCardSize: 'Custom card size',
    settingsCustomCardSizeDesc: 'Use custom width/height/ratio instead of preset card sizes',
    settingsCardMinWidth: 'Card width target',
    settingsCardMinHeight: 'Card minimum height',
    settingsCardImageRatio: 'Poster ratio (W/H)',
    settingsHorizontalCardMinWidth: 'Horizontal width target',
    settingsHorizontalCardHeight: 'Horizontal card height',
    settingsCardMinWidthDesc: 'Cards keep this width inside each column when there is enough space',
    settingsCardMinHeightDesc: 'Minimum poster block height for vertical cards',
    settingsCardImageRatioDesc: '0.67 = classic poster 2:3, 1.0 = square',
    settingsHorizontalCardMinWidthDesc: 'Minimum width for horizontal cards',
    settingsHorizontalCardHeightDesc: 'Fixed height for horizontal cards',
    settingsCustomCardReset: 'Reset custom card values',
    settingsAnimeSeasonProgress: 'Show season progress on anime cards',
    settingsAnimeEpisodeProgress: 'Show episode progress on anime cards',
    settingsSizeSmall: 'Small',
    settingsSizeMedium: 'Medium',
    settingsSizeLarge: 'Large',
    settingsOrientation: 'Card orientation',
    settingsOrientationVertical: 'Vertical',
    settingsOrientationHorizontal: 'Horizontal',
    settingsColor: 'Accent color',
    settingsLanguage: 'Language',
    settingsReset: 'Reset settings',
    settingsMediaGames: 'Show games',
    settingsMediaAnime: 'Show anime',
    settingsParticle: 'Particle effect',
    settingsParticleNone: 'None',
    settingsParticleSakura: '🌸 Sakura',
    settingsParticleSnow: '❄️ Snow',
    settingsParticleIntensity: 'Particle intensity',
    settingsFolder: 'Folder path',
    settingsGames: 'Games',
    settingsAnime: 'Anime',
    settingsComingSoon: 'Coming Soon',
    settingsExperiment: 'Experiment',
    settingsTitle: 'LOREBASE Settings',
    settingsSupportTitle: 'Support LOREBASE',
    settingsSupportDesc: 'Join Discord or support LOREBASE on Ko-fi and Patreon.',
    settingsSupportUnavailable: 'Link is not configured yet',
    settingsDangerZone: 'Danger Zone',
    settingsResetAllButton: 'Reset All Settings',
    settingsComingSoonMoviesText: 'Movies - Movies & Series tracking',
    settingsComingSoonBooksText: 'Books - Book collection',
    settingsGeneral: 'General',
    settingsShowAdult: 'Show 18+ content',
    settingsBadges: 'Card Customization',
    settingsPreviewMode: 'Preview mode',
    settingsPreviewGame: 'Game',
    settingsPreviewAnime: 'Anime',
    settingsDescriptionLines: 'Description lines',
    settingsDescriptionLinesDesc: 'Default is 4. Drag slider to increase lines.',
    settingsBadgesStatus: 'Status badge',
    settingsBadgesRating: 'Rating badge',
    settingsBadgesFavorite: 'Favorite badge',
    settingsBadgesStatusPosition: 'Status position',
    settingsBadgesRatingPosition: 'Rating position',
    settingsBadgesFavoritePosition: 'Favorite position',
    settingsBadgesStatusIconOnly: 'Status as icon only',
    settingsBadgesFavoritePulse: 'Favorite subtle pulse',
    settingsBadgesRatingMode: 'Rating style',
    settingsBadgesRatingModeStar: 'Star',
    settingsBadgesRatingModeEmoji: 'Emoji',
    settingsBadgesEditorHint: 'Click badge to enable/disable. Drag badge to one of the 4 corner zones.',
    settingsOverlayHint: 'Hover card and drag title/year/format/description. Drag description bottom-right corner to change lines. Double-click field to toggle on/off.',
    settingsOverlayReadoutIdle: 'Select title, year, format or description in hover card.',
    settingsOverlayApplyAllMedia: 'Apply overlay changes to all media',
    settingsOverlayApplyAllMediaDesc: 'When enabled, preview text and badge changes are synced between games and anime.',
    settingsBadgesPosition: 'Badges position',
    settingsBadgesPosTopLeft: 'Top left',
    settingsBadgesPosTopRight: 'Top right',
    settingsBadgesPosBottomLeft: 'Bottom left',
    settingsBadgesPosBottomRight: 'Bottom right',
    settingsDescLanguage: 'Interface language',
    settingsDescColor: 'Theme accent color',
    settingsDescFolder: 'Path to the library folder in your vault',
    settingsDescColumns: 'Maximum columns in the grid (3-8). The grid auto-fits down when the pane is narrow.',
    settingsDescOrientation: 'Choose card layout and image aspect ratio',
    settingsDescShowAdult: 'Show adult content in "All" view mode',
    settingsDescReset: 'Reset all settings to default values',
    settingsIntegrations: 'Integrations',
    settingsIntegrationsEnable: 'Enable integrations',
    settingsIntegrationsEnableDesc: 'Turn on metadata providers and templates',
    settingsIntegrationsProviders: 'Providers',
    settingsIntegrationsMediaProviders: 'Media providers',
    settingsIntegrationsTemplates: 'Templates',
    settingsIntegrationsProviderRawg: 'RAWG (Games)',
    settingsIntegrationsProviderSteam: 'Steam (Games)',
    settingsIntegrationsProviderIgdb: 'IGDB (Games)',
    settingsIntegrationsProviderAnilist: 'AniList (Anime)',
    settingsIntegrationsProviderShikimori: 'Shikimori (Anime)',
    settingsIntegrationsProviderKeyRequired: 'API key required',
    settingsIntegrationsProviderKeyOptional: 'API key not required',
    settingsIntegrationsProviderKeyPlaceholder: 'API key',
    settingsIntegrationsProviderClientIdPlaceholder: 'Client ID',
    settingsIntegrationsProviderClientSecretPlaceholder: 'Client Secret',
    settingsIntegrationsProviderIgdbHelpTitle: 'How to get IGDB credentials',
    settingsIntegrationsProviderIgdbHelpText: 'Create an app in Twitch Developer Console, then copy its Client ID and generate a Client Secret. IGDB uses those Twitch credentials for API access.',
    settingsIntegrationsProviderIgdbTwitchLink: 'Open Twitch Developer Console',
    settingsIntegrationsProviderIgdbDocsLink: 'Open IGDB API docs',
    settingsIntegrationsProviderTest: 'Test',
    settingsIntegrationsImageStorage: 'Local images',
    settingsIntegrationsImageStorageDesc: 'Experimental: save provider images into the vault',
    settingsIntegrationsImageStorageEnable: 'Save imported images locally',
    settingsIntegrationsImageStorageEnableDesc: 'Download poster/image fields and write local vault paths into new notes',
    settingsIntegrationsImageStorageFolder: 'Images folder',
    settingsIntegrationsImageStorageFolderDesc: 'Vault folder for downloaded game and anime images',
    settingsIntegrationsImageStorageDownloadExisting: 'Download existing images',
    settingsIntegrationsImageStorageDownloadExistingDesc: 'Scan existing game and anime notes, save remote image URLs locally, and update frontmatter',
    settingsIntegrationsImageStorageDownloadStarted: 'Downloading existing LOREBASE images...',
    settingsIntegrationsImageStorageDownloadDone: 'Existing image download complete',
    settingsIntegrationsGamesProvider: 'Games provider',
    settingsIntegrationsAnimeProvider: 'Anime provider',
    settingsIntegrationsGamesProviderDesc: 'Choose a provider for games',
    settingsIntegrationsAnimeProviderDesc: 'Choose a provider for anime',
    settingsIntegrationsGamesTemplate: 'Games template',
    settingsIntegrationsAnimeTemplate: 'Anime template',
    settingsIntegrationsGamesTemplateDesc: 'Template used when creating game notes',
    settingsIntegrationsAnimeTemplateDesc: 'Template used when creating anime notes',
    settingsIntegrationsTemplateContent: 'Template content',
    settingsIntegrationsTemplateDesc: 'YAML template with placeholders',
    settingsIntegrationsTemplateMode: 'Template mode',
    settingsIntegrationsTemplateModeDesc: 'Choose a simple or advanced template editor',
    settingsIntegrationsTemplateModeSimple: 'Simple',
    settingsIntegrationsTemplateModeAdvanced: 'Advanced',
    settingsIntegrationsTemplateFields: 'Fields to include',
    settingsIntegrationsHowLongToBeat: 'HowLongToBeat',
    settingsIntegrationsHowLongToBeatDesc: 'Fill Main/Main + Sides/Perfectionist from HowLongToBeat',
    templateFieldName: 'Name',
    templateFieldImage: 'Image',
    templateFieldImageHorizontal: 'Horizontal image',
    templateFieldPoster: 'Poster',
    templateFieldPosterHorizontal: 'Horizontal poster',
    templateFieldPlot: 'Description',
    templateFieldScoreImdb: 'IMDb score',
    templateFieldTags: 'Tags',
    templateFieldYear: 'Year',
    templateFieldStudios: 'Studios',
    templateFieldFormat: 'Format',
    templateFieldRating: 'Rating (user)',
    templateFieldStatus: 'Status',
    templateFieldDropped: 'Dropped',
    templateFieldFavorite: 'Favorite',
    templateFieldUrl: 'Source URL',
    templateFieldGameSeries: 'Game series',
    templateFieldGenres: 'Genres',
    templateFieldPlatforms: 'Platforms',
    templateFieldReleased: 'Release date',
    templateFieldDevelopers: 'Developers',
    templateFieldPublishers: 'Publishers',
    templateFieldMetacritic: 'Metacritic',
    templateFieldMain: 'Main',
    templateFieldMainPlusSides: 'Main + Sides',
    templateFieldCompletionist: 'Perfectionist',
    templateFieldAnimeParts: 'Anime parts',
    templateFieldIntegrationSource: 'Integration source',
    editProgressMain: 'Main',
    editProgressMainPlusSides: 'Main + Side Quests',
    editProgressPerfectionist: 'Perfectionist',
    templateFieldUserRating: 'User rating',
    templateFieldPlayed: 'Played',
    templateFieldPlaying: 'Playing',
    resetTitle: 'Restore default settings',
    resetSubtitle: 'This will restore all plugin settings to their default values.',
    resetWarning: 'This can\'t be undone.',
    resetConfirm: 'Restore defaults',
    resetConfirmAck: 'I understand this can\'t be undone',


    // Statistics
    statsTitle: 'Collection Statistics',
    statsTotal: 'Total',
    statsCompleted: 'Completed',
    statsAvgRating: 'Average rating',
    statsOf: 'of',
    statsDistribution: 'Status distribution',
    statsRatingDistribution: 'Rating distribution',
    statsAdditionalInfo: 'Additional info',
    statsSeries: 'Series',
    statsCustomPosters: 'Custom posters',
    statsAdultContent: '18+ content',
    statsRated: 'Rated',
    statsCompletionPercent: 'Completion',

    // Ratings
    ratingAwesome: 'Awesome',
    ratingGood: 'Good',
    ratingOkay: 'Okay',
    ratingWeak: 'Weak',
    ratingBad: 'Bad',

    // Misc
    year: 'Year',
    yearNotSpecified: 'Year N/A',
    noDescription: 'No description',
    noSeries: 'No series',
    randomGame: 'Random game',
    noGamesFound: 'No games found',

    // Context menu
    contextChangeStatus: 'Change status',
    contextChangeRating: 'Change rating',
    contextAddFavorite: 'Add to favorites',
    contextRemoveFavorite: 'Remove from favorites',
    contextEpisodePlusOne: 'Add +1 episode',
    contextEdit: 'Edit',
    contextDelete: 'Delete',
    contextClear: 'Clear',
    contextGames: 'Games',
    contextAnime: 'Anime',

    // Edit modal
    editRating: 'Rating',
    editStatus: 'Status',
    editFavorite: 'Favorite',
    editYear: 'Release year',
    editDescription: 'Description',
    editSeries: 'Series',
    editNoSeries: 'No series',
    editAdult: '18+ content',
    editCustomPoster: 'Custom poster',
    editSave: 'Save',
    editCancel: 'Cancel',
    editProgress: 'Progress',
    editCompletedOn: 'Date completed',
    editDetails: 'Details',
    editAdvanced: 'Advanced',
    editClear: 'Clear',
    editSeasonCurrent: 'Season (current)',
    editSeasonTotal: 'Seasons (total)',
    editEpisodeCurrent: 'Episode (current)',
    editEpisodeTotal: 'Episodes (total)',
    editFormat: 'Format',
    editSummary: 'Description',
    editUrl: 'Source URL',
    editEpisodeInc: 'Add 1 episode',
    editEnabled: 'Enabled',
    editDisabled: 'Disabled',
    editPoster: 'Poster',
    editQuickSettings: 'Quick settings',
    editTracking: 'Tracking',
    editPersonalRating: 'Personal rating',
    editRatingHint: 'Click stars to rate',
    editSaved: 'Saved',
    editUnsavedChanges: 'Unsaved changes',
    editCharsShort: 'chars.',
    editReleaseDate: 'Release date',
    editPublisher: 'Publisher',
    editDeveloper: 'Developer',
    editLocalPath: 'Local path',
    editOpen: 'Open',
    editTagPlaceholder: 'Add tag...',
    editDates: 'Dates',
    editAdded: 'Added',
    editUpdated: 'Updated',
    editUnknown: 'Unknown',
    editOverflow: 'More',
    editRemoveHint: 'Click to remove',
    editBreadcrumbGames: 'Editing / Games',
    editBreadcrumbAnime: 'Editing / Anime',
    editAnimeParts: 'Title parts',
    editAddPart: '+ part',
    editRemovePart: 'Remove part',
    editCannotRemoveLastPart: 'At least one part is required',
    editTotalEpisodes: 'Total episodes',
    editActivePart: 'Active part',
    animePartsCheck: 'Check parts',
    animePartsProviderTitle: 'Provider title parts',
    animePartsNew: 'New',
    animePartsSelected: 'Selected',
    animePartsNoNew: 'No new parts',
    animePartsSourceMissing: 'Could not determine anime source.',
    animePartsApply: 'Apply parts',
    planCheckLater: 'Check later',
    planPlaySoon: 'Play soon',
    planWaitEarlyAccess: 'Wait for early access to end',
    planNextInQueue: 'Next in queue',
    settingsStatusPlans: 'Statuses and plans',
    settingsStatusPlansDesc: 'Rename visible status labels and manage quick game plan tags.',
    settingsGameStatusLabels: 'Game status labels',
    settingsAnimeStatusLabels: 'Anime status labels',
    settingsGamePlanTags: 'Game plan tags',
    settingsGamePlanTagsDesc: 'One tag per line. These values are saved as regular tags.',
    formatTv: 'TV',
    formatMovie: 'Movie',
    formatOva: 'OVA',
    formatOna: 'ONA',
    formatSpecial: 'Special',

    // Delete modal
    deleteTitle: 'Delete game?',
    deleteSubtitle: 'You are about to permanently delete this game.',
    deleteWarning: 'This action can\'t be undone.',
    deleteConfirmAck: 'I understand that this will permanently delete the game',
    deleteConfirm: 'Delete',
    deleteCancel: 'Cancel',
    deleteTitleAnime: 'Delete anime?',
    deleteSubtitleAnime: 'You are about to permanently delete this anime.',
    deleteConfirmAckAnime: 'I understand that this will permanently delete the anime',

    // Notifications
    notifyLoading: 'Loading...',
    commandOpenLibrary: 'Open Library',
    commandAddGame: 'Add game',
    commandAddAnime: 'Add anime',
    commandSteamSync: 'Steam Sync',
    ribbonLibrary: 'LOREBASE Library',
    errorInitView: 'Error initializing view',
    errorLoadingItems: 'Error loading items',
    errorProcessingList: 'Error processing list. Please check console.',
    promptSearchGame: 'Enter game title',
    promptSearchAnime: 'Enter anime title',
    promptSearchPlaceholder: 'Type a title...',
    promptSelectResult: 'Select an item',
    promptSearchAction: 'Search',
    promptAddSelected: 'Add',
    promptSelectedLabel: 'Selected',
    promptReviewSelected: 'Review selected',
    promptReviewSelectedSubtitle: 'Review selected items before creating notes.',
    promptConfirmSelected: 'Confirm',
    promptRemoveSelected: 'Remove',
    promptAddAnotherTitle: 'Add another?',
    promptAddAnotherBodyGame: 'Search and add another game?',
    promptAddAnotherBodyAnime: 'Search and add another anime?',
    promptAddAnotherYes: 'Add more',
    promptAddAnotherNo: 'Done',
    noticeNoResults: 'No results found.',
    noticeMissingApiKey: 'API key is missing for the selected provider.',
    noticeProviderDisabled: 'Selected provider is disabled in settings.',
    noticeIntegrationsDisabled: 'Integrations are disabled in settings.',
    noticeCreated: 'Note created.',
    noticeSkipped: 'Skipped.',
    noticeProviderTestSuccess: 'Provider test succeeded.',
    noticeProviderTestFail: 'Provider test failed.',
    noticeIntegrationsError: 'Integration error',
    promptFileExistsTitle: 'File already exists',
    promptFileExistsBody: 'A note with this name already exists. Update it or skip?',
    promptFileExistsUpdate: 'Update',
    promptFileExistsSkip: 'Skip',
    commonOk: 'OK',
    commonCancel: 'Cancel',
    commonBack: 'Back',
    commonNoData: 'No data',
};

/** Russian translations */
const RU: Record<TranslationKey, string> = {
    // Statuses
    statusPlayed: 'Пройдено',
    statusPlaying: 'Играю',
    statusDropped: 'Заброшено',
    statusSandbox: 'Песочница',
    statusNotStarted: 'Не начато',
    statusFavorite: 'Избранное',
    statusPlanned: 'Запланировано',
    statusWatching: 'Смотрю',
    statusCompleted: 'Просмотрено',
    statusPaused: 'На паузе',

    // UI elements
    search: 'Поиск',
    searchPlaceholder: 'Поиск...',
    sort: 'Сортировка',
    sortName: 'Название',
    sortRating: 'Рейтинг',
    sortYear: 'Год',
    sortDateCompleted: 'Дата прохождения',
    sortDateWatched: 'Дата просмотра',
    sortOrder: 'Порядок',
    sortAsc: 'По возрастанию',
    sortDesc: 'По убыванию',
    status: 'Статус',
    filter: 'Фильтр',
    filterAdult: '18+',
    filterFlags: 'Флаги',
    tags: 'Теги',
    genres: 'Жанры',
    plans: 'Планы',
    tagsEmpty: 'Тегов пока нет',
    view: 'Вид',
    random: 'Случайная игра',
    randomAnime: 'Случайное аниме',
    stats: 'Статистика',
    settings: 'Настройки',

    // View modes
    viewGrid: 'Вертикальный',
    viewHorizontal: 'Горизонтальный',

    // Display modes
    modeCustom: 'Кастомные обложки',

    // Settings
    settingsColumns: 'Колонки',
    settingsCardSize: 'Размер карточки',
    settingsCustomCardSize: 'Кастомный размер карточки',
    settingsCustomCardSizeDesc: 'Использовать ручные размеры и соотношение вместо пресетов',
    settingsCardMinWidth: 'Целевая ширина карточки',
    settingsCardMinHeight: 'Минимальная высота карточки',
    settingsCardImageRatio: 'Соотношение постера (Ш/В)',
    settingsHorizontalCardMinWidth: 'Целевая ширина горизонтальной',
    settingsHorizontalCardHeight: 'Высота горизонтальной',
    settingsCardMinWidthDesc: 'При наличии места карточка держит эту ширину внутри колонки',
    settingsCardMinHeightDesc: 'Минимальная высота постера в вертикальных карточках',
    settingsCardImageRatioDesc: '0.67 = классический постер 2:3, 1.0 = квадрат',
    settingsHorizontalCardMinWidthDesc: 'Минимальная ширина для горизонтальных карточек',
    settingsHorizontalCardHeightDesc: 'Фиксированная высота горизонтальной карточки',
    settingsCustomCardReset: 'Сбросить кастомные значения',
    settingsAnimeSeasonProgress: 'Показывать прогресс сезона на аниме-карточках',
    settingsAnimeEpisodeProgress: 'Показывать прогресс эпизодов на аниме-карточках',
    settingsSizeSmall: 'Маленький',
    settingsSizeMedium: 'Средний',
    settingsSizeLarge: 'Большой',
    settingsOrientation: 'Ориентация карточек',
    settingsOrientationVertical: 'Вертикальная',
    settingsOrientationHorizontal: 'Горизонтальная',
    settingsColor: 'Акцентный цвет',
    settingsLanguage: 'Язык',
    settingsReset: 'Сбросить настройки',
    settingsMediaGames: 'Показывать игры',
    settingsMediaAnime: 'Показывать аниме',
    settingsParticle: 'Эффект частиц',
    settingsParticleNone: 'Нет',
    settingsParticleSakura: '🌸 Сакура',
    settingsParticleSnow: '❄️ Снег',
    settingsParticleIntensity: 'Интенсивность частиц',
    settingsFolder: 'Путь к папке',
    settingsGames: 'Игры',
    settingsAnime: 'Аниме',
    settingsComingSoon: 'Скоро',
    settingsExperiment: 'Эксперимент',
    settingsTitle: 'Настройки LOREBASE',
    settingsSupportTitle: 'Поддержать LOREBASE',
    settingsSupportDesc: 'Присоединяйтесь к Discord или поддержите LOREBASE на Ko-fi и Patreon.',
    settingsSupportUnavailable: 'Ссылка пока не настроена',
    settingsDangerZone: 'Опасная зона',
    settingsResetAllButton: 'Сбросить все настройки',
    settingsComingSoonMoviesText: 'Фильмы - Трекинг фильмов и сериалов',
    settingsComingSoonBooksText: 'Книги - Коллекция книг',
    settingsGeneral: 'Общие',
    settingsShowAdult: 'Показывать 18+',
    settingsBadges: 'Кастомизация карточек',
    settingsPreviewMode: 'Режим превью',
    settingsPreviewGame: 'Игра',
    settingsPreviewAnime: 'Аниме',
    settingsDescriptionLines: 'Строк описания',
    settingsDescriptionLinesDesc: 'По умолчанию 4. Потяни слайдер, чтобы увеличить.',
    settingsBadgesStatus: 'Бейдж статуса',
    settingsBadgesRating: 'Бейдж рейтинга',
    settingsBadgesFavorite: 'Бейдж избранного',
    settingsBadgesStatusPosition: 'Позиция статуса',
    settingsBadgesRatingPosition: 'Позиция рейтинга',
    settingsBadgesFavoritePosition: 'Позиция избранного',
    settingsBadgesStatusIconOnly: 'Статус только иконкой',
    settingsBadgesFavoritePulse: 'Легкое мигание избранного',
    settingsBadgesRatingMode: 'Стиль рейтинга',
    settingsBadgesRatingModeStar: 'Звезда',
    settingsBadgesRatingModeEmoji: 'Эмоджи',
    settingsBadgesEditorHint: 'Нажми на бейдж чтобы включить/выключить. Перетащи бейдж в одну из 4 угловых зон.',
    settingsOverlayHint: 'Наведи на карточку и перетаскивай название/год/формат/описание. Тяни правый нижний угол описания для строк. Двойной клик по полю — вкл/выкл.',
    settingsOverlayReadoutIdle: 'Выбери название, год, формат или описание на hover-карточке.',
    settingsOverlayApplyAllMedia: 'Применять overlay-изменения ко всем медиа',
    settingsOverlayApplyAllMediaDesc: 'Когда включено, изменения текста и бейджей в превью синхронизируются между играми и аниме.',
    settingsBadgesPosition: 'Позиция бейджей',
    settingsBadgesPosTopLeft: 'Сверху слева',
    settingsBadgesPosTopRight: 'Сверху справа',
    settingsBadgesPosBottomLeft: 'Снизу слева',
    settingsBadgesPosBottomRight: 'Снизу справа',
    settingsDescLanguage: 'Язык интерфейса',
    settingsDescColor: 'Цвет акцента темы',
    settingsDescFolder: 'Путь к папке библиотеки в хранилище',
    settingsDescColumns: 'Максимум колонок в сетке (3-8). При узкой панели сетка автоматически уменьшает их число.',
    settingsDescOrientation: 'Выберите ориентацию карточек',
    settingsDescShowAdult: 'Показывать 18+ в режиме "Все"',
    settingsDescReset: 'Сбросить все настройки к значениям по умолчанию',
    settingsIntegrations: 'Интеграции',
    settingsIntegrationsEnable: 'Включить интеграции',
    settingsIntegrationsEnableDesc: 'Включить провайдеры и шаблоны',
    settingsIntegrationsProviders: 'Провайдеры',
    settingsIntegrationsMediaProviders: 'Провайдеры медиа',
    settingsIntegrationsTemplates: 'Шаблоны',
    settingsIntegrationsProviderRawg: 'RAWG (Игры)',
    settingsIntegrationsProviderSteam: 'Steam (Игры)',
    settingsIntegrationsProviderIgdb: 'IGDB (Игры)',
    settingsIntegrationsProviderAnilist: 'AniList (Аниме)',
    settingsIntegrationsProviderShikimori: 'Shikimori (Аниме)',
    settingsIntegrationsProviderKeyRequired: 'Нужен API ключ',
    settingsIntegrationsProviderKeyOptional: 'API ключ не нужен',
    settingsIntegrationsProviderKeyPlaceholder: 'API ключ',
    settingsIntegrationsProviderClientIdPlaceholder: 'Client ID',
    settingsIntegrationsProviderClientSecretPlaceholder: 'Client Secret',
    settingsIntegrationsProviderIgdbHelpTitle: 'Как получить данные IGDB',
    settingsIntegrationsProviderIgdbHelpText: 'Создайте приложение в Twitch Developer Console, затем скопируйте Client ID и сгенерируйте Client Secret. IGDB использует эти Twitch-данные для доступа к API.',
    settingsIntegrationsProviderIgdbTwitchLink: 'Открыть Twitch Developer Console',
    settingsIntegrationsProviderIgdbDocsLink: 'Открыть документацию IGDB API',
    settingsIntegrationsProviderTest: 'Тест',
    settingsIntegrationsImageStorage: 'Локальные изображения',
    settingsIntegrationsImageStorageDesc: 'Экспериментально: сохранять картинки провайдеров в vault',
    settingsIntegrationsImageStorageEnable: 'Сохранять импортированные изображения локально',
    settingsIntegrationsImageStorageEnableDesc: 'Скачивать poster/image поля и записывать локальные пути в новые заметки',
    settingsIntegrationsImageStorageFolder: 'Папка изображений',
    settingsIntegrationsImageStorageFolderDesc: 'Папка vault для скачанных изображений игр и аниме',
    settingsIntegrationsImageStorageDownloadExisting: 'Скачать существующие изображения',
    settingsIntegrationsImageStorageDownloadExistingDesc: 'Проверить уже созданные заметки игр и аниме, сохранить внешние URL локально и обновить frontmatter',
    settingsIntegrationsImageStorageDownloadStarted: 'Скачиваю существующие изображения LOREBASE...',
    settingsIntegrationsImageStorageDownloadDone: 'Скачивание существующих изображений завершено',
    settingsIntegrationsGamesProvider: 'Провайдер игр',
    settingsIntegrationsAnimeProvider: 'Провайдер аниме',
    settingsIntegrationsGamesProviderDesc: 'Выберите провайдера для игр',
    settingsIntegrationsAnimeProviderDesc: 'Выберите провайдера для аниме',
    settingsIntegrationsGamesTemplate: 'Шаблон игр',
    settingsIntegrationsAnimeTemplate: 'Шаблон аниме',
    settingsIntegrationsGamesTemplateDesc: 'Шаблон при создании заметок игр',
    settingsIntegrationsAnimeTemplateDesc: 'Шаблон при создании заметок аниме',
    settingsIntegrationsTemplateContent: 'Содержимое шаблона',
    settingsIntegrationsTemplateDesc: 'YAML шаблон с плейсхолдерами',
    settingsIntegrationsTemplateMode: 'Режим шаблона',
    settingsIntegrationsTemplateModeDesc: 'Выберите простой или продвинутый редактор',
    settingsIntegrationsTemplateModeSimple: 'Простой',
    settingsIntegrationsTemplateModeAdvanced: 'Продвинутый',
    settingsIntegrationsTemplateFields: 'Поля для заполнения',
    settingsIntegrationsHowLongToBeat: 'HowLongToBeat (время прохождения)',
    settingsIntegrationsHowLongToBeatDesc: 'Заполнять поля времени прохождения из HowLongToBeat',
    templateFieldName: 'Название',
    templateFieldImage: 'Изображение',
    templateFieldImageHorizontal: 'Горизонтальное изображение',
    templateFieldPoster: 'Постер',
    templateFieldPosterHorizontal: 'Горизонтальный постер',
    templateFieldPlot: 'Описание',
    templateFieldScoreImdb: 'Оценка IMDb',
    templateFieldTags: 'Теги',
    templateFieldYear: 'Год',
    templateFieldStudios: 'Студии',
    templateFieldFormat: 'Формат',
    templateFieldRating: 'Оценка (польз.)',
    templateFieldStatus: 'Статус',
    templateFieldDropped: 'Заброшено',
    templateFieldFavorite: 'Избранное',
    templateFieldUrl: 'Источник URL',
    templateFieldGameSeries: 'Серия',
    templateFieldGenres: 'Жанры',
    templateFieldPlatforms: 'Платформы',
    templateFieldReleased: 'Дата релиза',
    templateFieldDevelopers: 'Разработчики',
    templateFieldPublishers: 'Издатели',
    templateFieldMetacritic: 'Metacritic',
    templateFieldMain: 'Основной сюжет',
    templateFieldMainPlusSides: 'Основной + сайд квесты',
    templateFieldCompletionist: 'Перфекционист',
    templateFieldAnimeParts: 'Состав аниме',
    templateFieldIntegrationSource: 'Источник интеграции',
    editProgressMain: 'Основной сюжет',
    editProgressMainPlusSides: 'Основной + сайд квесты',
    editProgressPerfectionist: 'Перфекционист',
    templateFieldUserRating: 'Оценка пользователя',
    templateFieldPlayed: 'Пройдено',
    templateFieldPlaying: 'Играю',
    resetTitle: 'Сбросить настройки',
    resetSubtitle: 'Все настройки плагина будут возвращены к значениям по умолчанию.',
    resetWarning: 'Отменить это действие нельзя.',
    resetConfirm: 'Сбросить',
    resetConfirmAck: 'Я понимаю, что это действие нельзя отменить',


    // Statistics
    statsTitle: 'Статистика коллекции',
    statsTotal: 'Всего',
    statsCompleted: 'Пройдено',
    statsAvgRating: 'Средняя оценка',
    statsOf: 'из',
    statsDistribution: 'Распределение статусов',
    statsRatingDistribution: 'Распределение оценок',
    statsAdditionalInfo: 'Дополнительно',
    statsSeries: 'Серии',
    statsCustomPosters: 'Пользовательские обложки',
    statsAdultContent: 'Контент 18+',
    statsRated: 'Оценено',
    statsCompletionPercent: 'Процент прохождения',

    // Ratings
    ratingAwesome: 'Отлично',
    ratingGood: 'Хорошо',
    ratingOkay: 'Нормально',
    ratingWeak: 'Слабо',
    ratingBad: 'Плохо',

    // Misc
    year: 'Год',
    yearNotSpecified: 'Год не указан',
    noDescription: 'Нет описания',
    noSeries: 'Без серии',
    randomGame: 'Случайная игра',
    noGamesFound: 'Игр не найдено',

    // Context menu
    contextChangeStatus: 'Изменить статус',
    contextChangeRating: 'Изменить оценку',
    contextAddFavorite: 'В избранное',
    contextRemoveFavorite: 'Убрать из избранного',
    contextEpisodePlusOne: 'Добавить +1 эпизод',
    contextEdit: 'Редактировать',
    contextDelete: 'Удалить',
    contextClear: 'Очистить',
    contextGames: 'Игры',
    contextAnime: 'Аниме',

    // Edit modal
    editRating: 'Оценка',
    editStatus: 'Статус',
    editFavorite: 'Избранное',
    editYear: 'Год выпуска',
    editDescription: 'Описание',
    editSeries: 'Серия',
    editNoSeries: 'Без серии',
    editAdult: 'Контент 18+',
    editCustomPoster: 'Пользовательская обложка',
    editSave: 'Сохранить',
    editCancel: 'Отмена',
    editProgress: 'Прогресс',
    editCompletedOn: 'Дата прохождения',
    editDetails: 'Детали',
    editAdvanced: 'Дополнительно',
    editClear: 'Очистить',
    editSeasonCurrent: 'Сезон (текущий)',
    editSeasonTotal: 'Сезонов (всего)',
    editEpisodeCurrent: 'Эпизод (текущий)',
    editEpisodeTotal: 'Эпизоды (всего)',
    editFormat: 'Формат',
    editSummary: 'Описание',
    editUrl: 'Источник URL',
    editEpisodeInc: 'Добавить 1 эпизод',
    editEnabled: 'Включено',
    editDisabled: 'Выключено',
    editPoster: 'Постер',
    editQuickSettings: 'Быстрые настройки',
    editTracking: 'Отслеживание',
    editPersonalRating: 'Личная оценка',
    editRatingHint: 'Нажмите на звезды для оценки',
    editSaved: 'Сохранено',
    editUnsavedChanges: 'Есть несохраненные изменения',
    editCharsShort: 'симв.',
    editReleaseDate: 'Дата релиза',
    editPublisher: 'Издатель',
    editDeveloper: 'Разработчик',
    editLocalPath: 'Локальный путь',
    editOpen: 'Открыть',
    editTagPlaceholder: 'Добавить тег...',
    editDates: 'Даты',
    editAdded: 'Добавлено',
    editUpdated: 'Обновлено',
    editUnknown: 'Неизвестно',
    editOverflow: 'Ещё',
    editRemoveHint: 'Нажмите, чтобы удалить',
    editBreadcrumbGames: 'Редактирование / Игры',
    editBreadcrumbAnime: 'Редактирование / Аниме',
    editAnimeParts: 'Состав тайтла',
    editAddPart: '+ часть',
    editRemovePart: 'Удалить часть',
    editCannotRemoveLastPart: 'Нужна хотя бы одна часть',
    editTotalEpisodes: 'Всего эпизодов',
    editActivePart: 'Активная часть',
    animePartsCheck: 'Проверить состав',
    animePartsProviderTitle: 'Состав из провайдера',
    animePartsNew: 'Новое',
    animePartsSelected: 'Выбрано',
    animePartsNoNew: 'Нет новых частей',
    animePartsSourceMissing: 'Не удалось определить источник',
    animePartsApply: 'Применить состав',
    planCheckLater: 'Проверить позже',
    planPlaySoon: 'Хочу сыграть скоро',
    planWaitEarlyAccess: 'Ждать окончания раннего доступа',
    planNextInQueue: 'Следующая в списке',
    settingsStatusPlans: 'Статусы и планы',
    settingsStatusPlansDesc: 'Переименовывает отображение статусов и управляет быстрыми план-метками игр.',
    settingsGameStatusLabels: 'Названия статусов игр',
    settingsAnimeStatusLabels: 'Названия статусов аниме',
    settingsGamePlanTags: 'План-метки игр',
    settingsGamePlanTagsDesc: 'Одна метка на строку. Эти значения сохраняются как обычные tags.',
    formatTv: 'TV',
    formatMovie: 'Фильм',
    formatOva: 'OVA',
    formatOna: 'ONA',
    formatSpecial: 'Спешл',

    // Delete modal
    deleteTitle: 'Удалить игру?',
    deleteSubtitle: 'Игра будет удалена навсегда.',
    deleteWarning: 'Это действие нельзя отменить.',
    deleteConfirmAck: 'Я понимаю, что игра будет удалена навсегда',
    deleteConfirm: 'Удалить',
    deleteCancel: 'Отмена',
    deleteTitleAnime: 'Удалить аниме?',
    deleteSubtitleAnime: 'Аниме будет удалено навсегда.',
    deleteConfirmAckAnime: 'Я понимаю, что аниме будет удалено навсегда',

    // Notifications
    notifyLoading: 'Загрузка...',
    commandOpenLibrary: 'Открыть библиотеку',
    commandAddGame: 'Добавить игру',
    commandAddAnime: 'Добавить аниме',
    commandSteamSync: 'Синхронизация Steam',
    ribbonLibrary: 'Библиотека LOREBASE',
    errorInitView: 'Ошибка инициализации представления',
    errorLoadingItems: 'Ошибка загрузки элементов',
    errorProcessingList: 'Ошибка обработки списка. Проверьте консоль.',
    promptSearchGame: 'Введите название игры',
    promptSearchAnime: 'Введите название аниме',
    promptSearchPlaceholder: 'Введите название...',
    promptSelectResult: 'Выберите элемент',
    promptSearchAction: 'Поиск',
    promptAddSelected: 'Добавить',
    promptSelectedLabel: 'Выбрано',
    promptReviewSelected: 'Проверить выбранное',
    promptReviewSelectedSubtitle: 'Проверьте выбранные элементы перед созданием заметок.',
    promptConfirmSelected: 'Подтвердить',
    promptRemoveSelected: 'Удалить',
    promptAddAnotherTitle: 'Добавить ещё?',
    promptAddAnotherBodyGame: 'Найти и добавить ещё одну игру?',
    promptAddAnotherBodyAnime: 'Найти и добавить ещё одно аниме?',
    promptAddAnotherYes: 'Ещё',
    promptAddAnotherNo: 'Готово',
    noticeNoResults: 'Ничего не найдено.',
    noticeMissingApiKey: 'Отсутствует API ключ для выбранного провайдера.',
    noticeProviderDisabled: 'Провайдер отключен в настройках.',
    noticeIntegrationsDisabled: 'Интеграции отключены в настройках.',
    noticeCreated: 'Заметка создана.',
    noticeSkipped: 'Пропущено.',
    noticeProviderTestSuccess: 'Проверка провайдера успешна.',
    noticeProviderTestFail: 'Проверка провайдера не удалась.',
    noticeIntegrationsError: 'Ошибка интеграции',
    promptFileExistsTitle: 'Файл уже существует',
    promptFileExistsBody: 'Заметка с таким именем уже есть. Обновить или пропустить?',
    promptFileExistsUpdate: 'Обновить',
    promptFileExistsSkip: 'Пропустить',
    commonOk: 'ОК',
    commonCancel: 'Отмена',
    commonBack: 'Назад',
    commonNoData: 'Нет данных',
};

// =============================================================================
// TRANSLATIONS MAP
// =============================================================================

const TRANSLATIONS: Record<Language, Record<TranslationKey, string>> = {
    en: EN,
    ru: RU,
};

// =============================================================================
// LOCALIZATION CLASS
// =============================================================================

/**
 * Localization manager for the plugin
 */
export class Localization {
    private currentLanguage: Language = 'en';

    /**
     * Set the current language
     */
    setLanguage(language: Language): void {
        this.currentLanguage = language;
    }

    /**
     * Get current language
     */
    getLanguage(): Language {
        return this.currentLanguage;
    }

    /**
     * Get translation for a key
     */
    t(key: TranslationKey): string {
        return TRANSLATIONS[this.currentLanguage][key] || key;
    }

    /**
     * Get all status labels for current language
     */
    getStatusLabels(): Record<string, string> {
        return {
            completed: this.t('statusCompleted'),
            playing: this.t('statusPlaying'),
            dropped: this.t('statusDropped'),
            sandbox: this.t('statusSandbox'),
            not_started: this.t('statusNotStarted'),
            planned: this.t('statusPlanned'),
            watching: this.t('statusWatching'),
            paused: this.t('statusPaused'),
        };
    }
}

/** Global localization instance */
export const i18n = new Localization();

/** Shorthand for translation */
export const t = (key: TranslationKey): string => i18n.t(key);
