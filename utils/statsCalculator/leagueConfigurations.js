/**
 * League Configurations Module - Sports league-specific configuration data
 * @module utils/statsCalculator/leagueConfigurations
 */

// Import required functions from module (circular reference handled in index.js)
const advancedCalculations = require('./advancedCalculations');

/**
 * League configurations with advanced metrics and predictive models
 * @type {Object}
 * @constant
 */
const LEAGUES = {
    // American Sports Leagues
    nba: {
        name: 'NBA',
        statsCalculator: advancedCalculations.calculateAdvancedMetric,
        advancedMetrics: {
            scoring: ['per', 'trueShooting', 'effectiveFgPct', 'pointsPerPossession'],
            efficiency: ['offRating', 'defRating', 'netRating', 'pace'],
            impact: ['plusMinus', 'valueOverReplacement', 'winShares'],
            advanced: ['usageRate', 'assistPercentage', 'reboundRate']
        },
        realTimeTracking: {
            gameFlow: true,
            playerTracking: true,
            shotTracking: true,
            momentum: true
        },
        predictiveModels: {
            game: ['winProbability', 'scoreProjection', 'playerPerformance'],
            season: ['playoffProbability', 'seedPrediction', 'recordForecast'],
            player: ['injuryRisk', 'fatigueIndex', 'performanceTrend']
        }
    },
    nfl: {
        name: 'NFL',
        statsCalculator: advancedCalculations.calculateNFLStats,
        advancedMetrics: {
            offense: ['qbr', 'epa', 'dvoa', 'successRate'],
            defense: ['pressureRate', 'coverageRating', 'tackleEfficiency'],
            situational: ['thirdDownEff', 'redZoneEff', 'twoMinuteDrill'],
            advanced: ['winProbabilityAdded', 'expectedPoints', 'clutchFactor']
        },
        realTimeTracking: {
            formation: true,
            personnel: true,
            playType: true,
            situational: true
        },
        predictiveModels: {
            game: ['gameScripts', 'playPrediction', 'scoringDrive'],
            player: ['injuryRisk', 'performanceDecline', 'matchupAdvantage'],
            team: ['gameplanSuccess', 'adjustmentImpact', 'situationalEdge']
        }
    },
    mlb: {
        name: 'MLB',
        statsCalculator: advancedCalculations.calculateMLBStats,
        advancedMetrics: {
            batting: ['woba', 'ops_plus', 'war', 'babip'],
            pitching: ['fip', 'xFIP', 'era_plus', 'whip'],
            fielding: ['drs', 'uzr', 'oaa', 'framing'],
            situational: ['clutchScore', 'leverageIndex', 'winProbabilityAdded']
        },
        realTimeTracking: {
            pitchData: true,
            fieldingPosition: true,
            batTracking: true,
            ballTracking: true
        },
        predictiveModels: {
            atBat: ['pitchPrediction', 'hitProbability', 'outcomeLikelihood'],
            game: ['winProbability', 'pitcherEndurance', 'relieverUsage'],
            season: ['playerProjections', 'teamPerformance', 'injuryRisk']
        }
    },
    nhl: {
        name: 'NHL',
        statsCalculator: advancedCalculations.calculateNHLStats,
        advancedMetrics: {
            scoring: ['corsi', 'fenwick', 'pdo', 'expectedGoals'],
            possession: ['zoneStarts', 'entrySuccess', 'forecheck'],
            individual: ['gameScore', 'valueAdded', 'replacementLevel'],
            situational: ['powerPlayEff', 'penaltyKillRate', 'highDangerChances']
        },
        realTimeTracking: {
            playerPosition: true,
            puckTracking: true,
            shotQuality: true,
            timeOnIce: true
        },
        predictiveModels: {
            game: ['goalProbability', 'momentumShifts', 'fatigueFactor'],
            player: ['performanceDecline', 'injuryRisk', 'lineChemistry'],
            team: ['tacticSuccess', 'matchupAdvantage', 'depthImpact']
        }
    },

    // European Soccer Leagues
    premierleague: {
        name: 'Premier League',
        statsCalculator: advancedCalculations.calculateSoccerStats,
        advancedMetrics: {
            attack: ['xG', 'xA', 'shotQuality', 'chanceCreation'],
            possession: ['ppda', 'buildUpSuccess', 'progressiveActions'],
            defense: ['defensiveActions', 'pressureSuccess', 'recoveryRate'],
            tactical: ['formationEfficiency', 'passNetworks', 'spatialControl']
        },
        realTimeTracking: {
            playerPosition: true,
            ballTracking: true,
            pressure: true,
            teamShape: true
        },
        predictiveModels: {
            match: ['scorePrediction', 'momentumSwings', 'tacticalAdjustments'],
            player: ['performanceDecline', 'injuryRisk', 'fatigueImpact'],
            team: ['formTrajectory', 'styleMatchup', 'pressureEffectiveness']
        }
    },
    laliga: {
        name: 'La Liga',
        statsCalculator: advancedCalculations.calculateSoccerStats,
        advancedMetrics: {
            attack: ['xG', 'xA', 'possessionValue', 'chanceQuality'],
            tactical: ['pressureIndex', 'buildupEfficiency', 'transitionSpeed'],
            technical: ['skillMoves', 'duelSuccess', 'ballControl'],
            positional: ['spaceCreation', 'defensiveShape', 'pressingHeight']
        },
        realTimeTracking: {
            playerMovement: true,
            teamStructure: true,
            pressureEvents: true,
            ballCirculation: true
        },
        predictiveModels: {
            match: ['tacticalBattles', 'keyMatchups', 'momentumShifts'],
            team: ['formPrediction', 'styleEffectiveness', 'adaptability'],
            player: ['technicalPerformance', 'physicalReadiness', 'decisionQuality']
        }
    },
    bundesliga: {
        name: 'Bundesliga',
        statsCalculator: advancedCalculations.calculateSoccerStats,
        advancedMetrics: {
            pressing: ['pressureSuccess', 'counterPressure', 'recoverySpeed'],
            transition: ['counterAttack', 'restDefense', 'transitionTime'],
            physical: ['distanceCovered', 'sprintMetrics', 'intensityLevels'],
            tactical: ['formationSuccess', 'pressureZones', 'defensiveShape']
        },
        realTimeTracking: {
            pressureMap: true,
            sprintTracking: true,
            formationAnalysis: true,
            ballMovement: true
        },
        predictiveModels: {
            match: ['pressureImpact', 'physicalDominance', 'tacticalSuccess'],
            team: ['pressingEfficiency', 'transitionThreat', 'energyManagement'],
            player: ['workloadOptimization', 'pressureContribution', 'recoveryNeeds']
        }
    },
    seriea: {
        name: 'Serie A',
        statsCalculator: advancedCalculations.calculateSoccerStats,
        advancedMetrics: {
            tactical: ['defensiveOrganization', 'tacticalFlexibility', 'pressureStructure'],
            technical: ['passAccuracy', 'dribbleSuccess', 'shotPlacement'],
            strategic: ['setPlayEfficiency', 'counterAttackSuccess', 'pressureTriggers'],
            mental: ['decisionMaking', 'adaptability', 'composure']
        },
        realTimeTracking: {
            tacticalShape: true,
            playerRotation: true,
            defenseTracking: true,
            pressureSystem: true
        },
        predictiveModels: {
            match: ['tacticalMatchups', 'systemEffectiveness', 'adaptiveStrategy'],
            team: ['formationSuccess', 'defensiveStability', 'pressureEfficiency'],
            player: ['tacticalFit', 'rolePerformance', 'positionalDiscipline']
        }
    }
};

// Export league configurations
module.exports = {
    LEAGUES
};