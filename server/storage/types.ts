import type {
  User, InsertUser, PlayerStatistic, EmailVerificationToken, PasswordResetToken,
  Event, InsertEvent, MatchResult, MatchPlayerStatistic,
  EventResponse, InsertEventResponse,
  Poll, InsertPoll,
  PollOption, InsertPollOption,
  PollVote, InsertPollVote,
  Payment, InsertPayment,
  BankTransaction, WalletTransaction, InsertWalletTransaction,
  CashTransaction, InsertCashTransaction,
  NotificationSettings, InsertNotificationSettings,
  PushSubscriptionRecord,
  AppSetting, TeamResponsibility, InsertTeamResponsibility,
  TeamInventoryItem, InsertTeamInventoryItem,
  MediaCollection, MediaFile, Opponent,
  InsertOpponent, UpdateOpponent,
} from '@shared/schema';

export interface NewStoredMediaFile {
  storedName: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedBy: number;
  sortOrder?: number;
}

export interface OpponentMatchSummary {
  eventId: number;
  startTime: string;
  homeAway: string | null;
  opponent: string | null;
  teamScore: number | null;
  opponentScore: number | null;
}

export type TacticWithFiles = MediaCollection & { files: MediaFile[] };
export type PhotoAlbumWithFiles = MediaCollection & { files: MediaFile[] };
export type TeamResponsibilityWithOwners = TeamResponsibility & {
  owners: Array<Pick<User, "id" | "name">>;
  inventoryItems: TeamInventoryItem[];
};

export interface PlayerStatisticSummary {
  userId: number;
  name: string;
  goals: number;
  assists: number;
  appearances: number;
  updatedAt: string | null;
}

export interface MatchPlayerContributionInput {
  userId: number;
  goals: number;
  assists: number;
  played: boolean;
}

export type MatchResultWithPlayers = MatchResult & {
  players: Array<MatchPlayerStatistic & { user: Pick<User, "id" | "name"> }>;
};

export type MatchOutcome = "W" | "D" | "L";

export interface ReconcileBankTransactionInput {
  bankTransactionId: number;
  userId: number;
  paymentId?: number;
  actorId: number;
}

export type ImportedBankTransaction = Omit<
  BankTransaction,
  "id" | "reconciledUserId" | "reconciledBy" | "reconciledAt"
>;

export interface ReconcileBankTransactionResult {
  transaction: BankTransaction;
  payment: Payment | null;
  /** Amount newly credited to the user's wallet, in whole CZK. */
  walletCredit: number;
}

export interface RetryBankTransactionMatchingResult {
  checked: number;
  matched: number;
}

export interface TeamVenueStats {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
}

export interface TeamRecentResult {
  eventId: number;
  startTime: string;
  opponent: string | null;
  homeAway: string | null;
  teamScore: number;
  opponentScore: number;
  outcome: MatchOutcome;
}

export interface TeamStatisticSummary {
  totalMatches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  winRate: number | null; // percent (0–100), null when no matches
  goalsPerMatch: number | null;
  goalsAgainstPerMatch: number | null;
  form: MatchOutcome[]; // last 5 results, most recent first
  home: TeamVenueStats;
  away: TeamVenueStats;
  biggestWin: TeamRecentResult | null;
  biggestLoss: TeamRecentResult | null;
  recentResults: TeamRecentResult[]; // most recent first, max 10
}

export interface IStorage {
  // Users
  getUser(id: number): User | undefined;
  getUserByEmail(email: string): User | undefined;
  getAllUsers(): User[];
  createUser(user: InsertUser): User;
  updateUserRole(id: number, role: string): User | undefined;
  updateUserActiveStatus(id: number, isActive: boolean): User | undefined;
  updateUserPlayerStatus(id: number, isPlayerActive: boolean): User | undefined;
  updateUserTheme(id: number, theme: "light" | "dark"): User | undefined;
  updateUserProfile(id: number, firstName: string, lastName: string, nickname: string): User | undefined;
  updateUserPassword(id: number, password: string): User | undefined;
  markUserEmailVerified(id: number): User | undefined;
  acceptTerms(id: number, termsVersion: number): User | undefined;

  // Player statistics
  getPlayerStatistics(): PlayerStatisticSummary[];
  adjustPlayerStatistics(userId: number, goalsDelta: number, assistsDelta: number): PlayerStatisticSummary | undefined;

  // Email verification
  createEmailVerificationToken(userId: number, tokenHash: string, expiresAt: string): EmailVerificationToken;
  getEmailVerificationToken(tokenHash: string): EmailVerificationToken | undefined;
  deleteEmailVerificationTokens(userId: number): void;

  // Password reset
  createPasswordResetToken(userId: number, tokenHash: string, expiresAt: string): PasswordResetToken;
  getPasswordResetToken(tokenHash: string): PasswordResetToken | undefined;
  deletePasswordResetTokens(userId: number): void;

  // Events
  getEvent(id: number): Event | undefined;
  getEventsByExternalId(externalId: string): Event[];
  getAllEvents(): Event[];
  getUpcomingEvents(limit?: number): Event[];
  createEvent(event: InsertEvent): Event;
  updateEvent(id: number, data: Partial<InsertEvent>): Event | undefined;
  deleteEvent(id: number): void;

  // Match results
  getMatchResult(eventId: number): MatchResultWithPlayers | undefined;
  upsertMatchResult(
    eventId: number,
    teamScore: number,
    opponentScore: number,
    notes: string | null,
    updatedBy: number,
    players: MatchPlayerContributionInput[],
  ): MatchResultWithPlayers;
  deleteMatchResult(eventId: number): boolean;

  // Team statistics
  getTeamStatistics(): TeamStatisticSummary;

  // Event Responses
  getEventResponse(eventId: number, userId: number): EventResponse | undefined;
  getEventResponses(eventId: number): (EventResponse & { user: Pick<User, 'id' | 'name'> })[];
  upsertEventResponse(response: InsertEventResponse): void;

  // Polls
  getPoll(id: number): Poll | undefined;
  getAllPolls(): Poll[];
  createPoll(poll: InsertPoll): Poll;
  deletePoll(id: number): void;

  // Poll Options
  getPollOptions(pollId: number): PollOption[];
  createPollOption(option: InsertPollOption): PollOption;
  createPollOptions(options: InsertPollOption[]): void;

  // Poll Votes
  getPollVotes(pollId: number): (PollVote & { user: Pick<User, 'id' | 'name'> })[];
  getUserPollVote(pollId: number, userId: number): PollVote | undefined;
  upsertPollVote(vote: InsertPollVote): void;

  // Payments
  getPayment(id: number): Payment | undefined;
  getPaymentsByUser(userId: number): Payment[];
  getAllPayments(): (Payment & { user: Pick<User, 'id' | 'name'> })[];
  createPayment(payment: InsertPayment): Payment;
  createPayments(paymentList: InsertPayment[]): Payment[];
  updatePaymentStatus(id: number, status: string): Payment | undefined;
  deletePayment(id: number): void;
  getPendingPaymentsByVariableSymbol(vs: string): Payment[];

  // Bank Transactions
  getAllBankTransactions(limit?: number, fromDate?: string): BankTransaction[];
  getUnmatchedBankTransactions(): BankTransaction[];
  importBankTransaction(tx: ImportedBankTransaction): {
    transaction: BankTransaction;
    created: boolean;
    matched: boolean;
  };
  reconcileBankTransaction(input: ReconcileBankTransactionInput): ReconcileBankTransactionResult;
  retryUnmatchedBankTransactions(): RetryBankTransactionMatchingResult;

  // User wallets
  getWalletBalance(userId: number): number;
  getWalletBalances(): Map<number, number>;
  getWalletTransactionsByUser(userId: number): WalletTransaction[];
  createWalletTransaction(transaction: InsertWalletTransaction): WalletTransaction | undefined;

  // Cashbox
  getAllCashTransactions(): CashTransaction[];
  getCashBalance(): number;
  createCashTransaction(tx: InsertCashTransaction): CashTransaction;
  deleteCashTransaction(id: number): boolean;

  // Notification Settings
  getNotificationSettings(userId: number): NotificationSettings | undefined;
  upsertNotificationSettings(settings: Partial<InsertNotificationSettings> & { userId: number }): void;
  getPushSubscriptionsByUser(userId: number): PushSubscriptionRecord[];
  upsertPushSubscription(userId: number, endpoint: string, subscription: string): PushSubscriptionRecord;
  deletePushSubscription(userId: number, endpoint: string): void;
  deletePushSubscriptionByEndpoint(endpoint: string): void;

  // Team organization
  getTeamResponsibilities(): TeamResponsibilityWithOwners[];
  getTeamResponsibility(id: number): TeamResponsibilityWithOwners | undefined;
  createTeamResponsibility(responsibility: InsertTeamResponsibility, ownerIds: number[]): TeamResponsibilityWithOwners;
  updateTeamResponsibility(id: number, responsibility: InsertTeamResponsibility, ownerIds: number[]): TeamResponsibilityWithOwners | undefined;
  deleteTeamResponsibility(id: number): boolean;
  reorderTeamResponsibilities(ids: number[]): void;
  getTeamInventoryItem(responsibilityId: number, itemId: number): TeamInventoryItem | undefined;
  createTeamInventoryItem(item: InsertTeamInventoryItem): TeamInventoryItem;
  updateTeamInventoryItem(responsibilityId: number, itemId: number, item: Omit<InsertTeamInventoryItem, "responsibilityId">): TeamInventoryItem | undefined;
  deleteTeamInventoryItem(responsibilityId: number, itemId: number): boolean;
  reorderTeamInventoryItems(responsibilityId: number, ids: number[]): void;

  // App Settings
  getAppSetting(key: string): string | undefined;
  setAppSetting(key: string, value: string): void;

  // Team media
  getMediaFile(id: number): MediaFile | undefined;
  getPhotos(): MediaFile[];
  getPhotoAlbums(): PhotoAlbumWithFiles[];
  getPhotoAlbum(id: number): PhotoAlbumWithFiles | undefined;
  createPhotoAlbum(title: string, createdBy: number): MediaCollection;
  renamePhotoAlbum(id: number, title: string): MediaCollection | undefined;
  deletePhotoAlbum(id: number): void;
  createPhotos(files: NewStoredMediaFile[], albumId?: number | null): MediaFile[];
  movePhoto(photoId: number, albumId: number | null): MediaFile | undefined;
  deleteMediaFile(id: number): void;
  getTacticCollections(): TacticWithFiles[];
  getTacticCollection(id: number): TacticWithFiles | undefined;
  createTacticCollection(
    title: string,
    description: string | null,
    createdBy: number,
    files: NewStoredMediaFile[],
  ): TacticWithFiles;
  updateTacticCollection(
    id: number,
    title: string,
    description: string | null,
    fileOrder: number[],
    newFiles: NewStoredMediaFile[],
  ): TacticWithFiles | undefined;
  deleteTacticFile(collectionId: number, fileId: number): MediaFile | undefined;
  deleteTacticCollection(id: number): void;
}
