/**
 * TypeScript declarations for global objects
 */

interface Window {
    dataService?: {
        getTeams: (league: string) => Promise<any[]>;
        getPlayers: (teamId: string, league: string) => Promise<any[]>;
        getPlayerStats: (playerId: string, league: string) => Promise<any>;
        clearCache: () => void;
    };
    toast?: {
        success: (message: string) => void;
        error: (message: string) => void;
        warning: (message: string) => void;
        info: (message: string) => void;
    };
    showPlayerDetails?: (playerId: string) => void;
    fetchPlayersByTeam?: (teamId: string, leagueId?: string) => Promise<any[]>;
    displayPlayers?: (players: any[], container: HTMLElement) => void;
    Chart?: any; // Chart.js
}

// Declare global functions
declare function showPlayerDetails(playerId: string): void;
declare function showToast(type: string, message: string): void;
declare function fetchPlayersByTeam(teamId: string, leagueId?: string): Promise<any[]>;
declare function fetchPlayerStats(playerId: string, leagueId: string): Promise<any>;
declare function displayPlayers(players: any[], container: HTMLElement): void;

// Declare Chart class for Chart.js
declare class Chart {
    constructor(canvas: HTMLCanvasElement, config: any);
    update(): void;
    destroy(): void;
}

// Declare additional interfaces for DashboardManager
interface DashboardManager {
    loadPlayerStats(playerId: string): void;
} 