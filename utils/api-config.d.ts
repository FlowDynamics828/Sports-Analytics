/**
 * Type definitions for the API configuration
 */

/**
 * League API configuration interface
 */
export interface LeagueApiConfig {
  url: string;
  key: string;
  schedulesEndpoint: string;
  scoresEndpoint: string;
  competitionId: number;
  teamEndpoint: string;
  playerEndpoint: string;
  teamStatsEndpoint: string;
  seasonEndpoint: string;
}

/**
 * API configuration mapping leagues to their API settings
 */
export interface ApiConfigMap {
  NBA: LeagueApiConfig;
  NFL: LeagueApiConfig;
  MLB: LeagueApiConfig;
  NHL: LeagueApiConfig;
  PREMIER_LEAGUE: LeagueApiConfig;
  LA_LIGA: LeagueApiConfig;
  BUNDESLIGA: LeagueApiConfig;
  SERIE_A: LeagueApiConfig;
  [key: string]: LeagueApiConfig;  // Index signature to allow string indexing
}

/**
 * API configuration constant
 */
export const API_CONFIG: ApiConfigMap; 