// Composition root for persistence. The per-domain implementations live in
// ./storage/*; this file wires them into the single `storage` singleton that
// the rest of the server imports. Database opening, WAL, and startup
// migrations live in ./storage/db.ts.

import { db } from "./storage/db";
import { UsersStore } from "./storage/users";
import { AuthTokensStore } from "./storage/tokens";
import { EventsStore } from "./storage/events";
import { PollsStore } from "./storage/polls";
import { PaymentsStore } from "./storage/payments";
import { NotificationStore } from "./storage/notifications";
import { TeamStore } from "./storage/team";
import { AppSettingsStore } from "./storage/settings";
import { MediaStore } from "./storage/media";
import { OpponentsStore } from "./storage/opponents";
import { StatsStore } from "./storage/stats";
import type { IStorage } from "./storage/types";

export type {
  NewStoredMediaFile,
  TacticWithFiles,
  TeamResponsibilityWithOwners,
  PlayerStatisticSummary,
  MatchPlayerContributionInput,
  MatchResultWithPlayers,
  TeamStatisticSummary,
  IStorage,
} from "./storage/types";

export { db };

// Binds every store method so `this` inside the implementation always refers
// to the owning store (which is fully self-contained). Callers only ever see
// the flat `storage` facade.
const bind = <T extends object>(store: T) =>
  new Proxy(store, {
    get: (target, property) => {
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as T;

export class DatabaseStorage implements IStorage {
  private readonly users = bind(new UsersStore());
  private readonly tokens = bind(new AuthTokensStore());
  private readonly events = bind(new EventsStore());
  private readonly polls = bind(new PollsStore());
  private readonly payments = bind(new PaymentsStore());
  private readonly notifications = bind(new NotificationStore());
  private readonly team = bind(new TeamStore());
  private readonly settings = bind(new AppSettingsStore());
  private readonly media = bind(new MediaStore());
  private readonly opponentsStore = bind(new OpponentsStore());
  private readonly stats = bind(new StatsStore());

  // Users
  getUser = this.users.getUser;
  getUserByEmail = this.users.getUserByEmail;
  getAllUsers = this.users.getAllUsers;
  createUser = this.users.createUser;
  updateUserRole = this.users.updateUserRole;
  updateUserActiveStatus = this.users.updateUserActiveStatus;
  updateUserTheme = this.users.updateUserTheme;
  updateUserProfile = this.users.updateUserProfile;
  updateUserPassword = this.users.updateUserPassword;
  markUserEmailVerified = this.users.markUserEmailVerified;
  acceptTerms = this.users.acceptTerms;

  // Player statistics
  getPlayerStatistics = this.users.getPlayerStatistics;
  adjustPlayerStatistics = this.users.adjustPlayerStatistics;

  // Email verification
  createEmailVerificationToken = this.tokens.createEmailVerificationToken;
  getEmailVerificationToken = this.tokens.getEmailVerificationToken;
  deleteEmailVerificationTokens = this.tokens.deleteEmailVerificationTokens;

  // Password reset
  createPasswordResetToken = this.tokens.createPasswordResetToken;
  getPasswordResetToken = this.tokens.getPasswordResetToken;
  deletePasswordResetTokens = this.tokens.deletePasswordResetTokens;

  // Events
  getEvent = this.events.getEvent;
  getEventsByExternalId = this.events.getEventsByExternalId;
  getAllEvents = this.events.getAllEvents;
  getUpcomingEvents = this.events.getUpcomingEvents;
  createEvent = this.events.createEvent;
  updateEvent = this.events.updateEvent;
  deleteEvent = this.events.deleteEvent;

  // Match results
  getMatchResult = this.events.getMatchResult;
  upsertMatchResult = this.events.upsertMatchResult;
  deleteMatchResult = this.events.deleteMatchResult;

  // Event Responses
  getEventResponse = this.events.getEventResponse;
  getEventResponses = this.events.getEventResponses;
  upsertEventResponse = this.events.upsertEventResponse;

  // Team statistics
  getTeamStatistics = this.stats.getTeamStatistics;

  // Polls
  getPoll = this.polls.getPoll;
  getAllPolls = this.polls.getAllPolls;
  createPoll = this.polls.createPoll;
  deletePoll = this.polls.deletePoll;

  // Poll Options
  getPollOptions = this.polls.getPollOptions;
  createPollOption = this.polls.createPollOption;
  createPollOptions = this.polls.createPollOptions;

  // Poll Votes
  getPollVotes = this.polls.getPollVotes;
  getUserPollVote = this.polls.getUserPollVote;
  upsertPollVote = this.polls.upsertPollVote;

  // Payments
  getPayment = this.payments.getPayment;
  getPaymentsByUser = this.payments.getPaymentsByUser;
  getAllPayments = this.payments.getAllPayments;
  createPayment = this.payments.createPayment;
  createPayments = this.payments.createPayments;
  updatePaymentStatus = this.payments.updatePaymentStatus;
  deletePayment = this.payments.deletePayment;
  getPendingPaymentsByVariableSymbol = this.payments.getPendingPaymentsByVariableSymbol;

  // Bank Transactions
  getAllBankTransactions = this.payments.getAllBankTransactions;
  getUnmatchedBankTransactions = this.payments.getUnmatchedBankTransactions;
  importBankTransaction = this.payments.importBankTransaction;
  updateBankTransactionMatch = this.payments.updateBankTransactionMatch;

  // User wallets
  getWalletBalance = this.payments.getWalletBalance;
  getWalletBalances = this.payments.getWalletBalances;
  getWalletTransactionsByUser = this.payments.getWalletTransactionsByUser;
  createWalletTransaction = this.payments.createWalletTransaction;

  // Cashbox
  getAllCashTransactions = this.payments.getAllCashTransactions;
  getCashBalance = this.payments.getCashBalance;
  createCashTransaction = this.payments.createCashTransaction;
  deleteCashTransaction = this.payments.deleteCashTransaction;

  // Notification Settings
  getNotificationSettings = this.notifications.getNotificationSettings;
  upsertNotificationSettings = this.notifications.upsertNotificationSettings;
  getPushSubscriptionsByUser = this.notifications.getPushSubscriptionsByUser;
  upsertPushSubscription = this.notifications.upsertPushSubscription;
  deletePushSubscription = this.notifications.deletePushSubscription;
  deletePushSubscriptionByEndpoint = this.notifications.deletePushSubscriptionByEndpoint;

  // Team organization
  getTeamResponsibilities = this.team.getTeamResponsibilities;
  getTeamResponsibility = this.team.getTeamResponsibility;
  createTeamResponsibility = this.team.createTeamResponsibility;
  updateTeamResponsibility = this.team.updateTeamResponsibility;
  deleteTeamResponsibility = this.team.deleteTeamResponsibility;
  reorderTeamResponsibilities = this.team.reorderTeamResponsibilities;
  getTeamInventoryItem = this.team.getTeamInventoryItem;
  createTeamInventoryItem = this.team.createTeamInventoryItem;
  updateTeamInventoryItem = this.team.updateTeamInventoryItem;
  deleteTeamInventoryItem = this.team.deleteTeamInventoryItem;
  reorderTeamInventoryItems = this.team.reorderTeamInventoryItems;

  // App Settings
  getAppSetting = this.settings.getAppSetting;
  setAppSetting = this.settings.setAppSetting;

  // Team media
  getMediaFile = this.media.getMediaFile;
  getPhotos = this.media.getPhotos;
  getPhotoAlbums = this.media.getPhotoAlbums;
  getPhotoAlbum = this.media.getPhotoAlbum;
  createPhotoAlbum = this.media.createPhotoAlbum;
  renamePhotoAlbum = this.media.renamePhotoAlbum;
  deletePhotoAlbum = this.media.deletePhotoAlbum;
  createPhotos = this.media.createPhotos;
  movePhoto = this.media.movePhoto;
  deleteMediaFile = this.media.deleteMediaFile;
  getTacticCollections = this.media.getTacticCollections;
  getTacticCollection = this.media.getTacticCollection;
  createTacticCollection = this.media.createTacticCollection;
  updateTacticCollection = this.media.updateTacticCollection;
  deleteTacticFile = this.media.deleteTacticFile;
  deleteTacticCollection = this.media.deleteTacticCollection;

  // Opponents (not part of IStorage)
  getAllOpponents = this.opponentsStore.getAllOpponents;
  getOpponent = this.opponentsStore.getOpponent;
  getOpponentMatches = this.opponentsStore.getOpponentMatches;
  createOpponent = this.opponentsStore.createOpponent;
  updateOpponent = this.opponentsStore.updateOpponent;
  deleteOpponent = this.opponentsStore.deleteOpponent;
}

export const storage = new DatabaseStorage();
