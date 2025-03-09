baseStats.gamesPlayed = gameIds.size;
  
  // Calculate win percentage (placeholder - this would usually come from game results)
  baseStats.wins = Math.floor(baseStats.gamesPlayed * Math.random() * 0.8);
  baseStats.losses = baseStats.gamesPlayed - baseStats.wins;
  baseStats.winPercentage = baseStats.gamesPlayed > 0 ? (baseStats.wins / baseStats.gamesPlayed) * 100 : 0;
  
  // Calculate team chemistry and efficiency metrics (simulated)
  baseStats.teamChemistry = 50 + Math.random() * 40;
  baseStats.playerEfficiency = 60 + Math.random() * 30;
  
  // Calculate starter vs bench impact
  const starters = players.filter(p => p.isStarter);
  const bench = players.filter(p => !p.isStarter);
  
  baseStats.starterImpact = starters.length > 0 ? 
    starters.reduce((sum, player) => {
      // Use advanced metrics if available, otherwise use basic stats
      if (player.advancedMetrics && player.advancedMetrics.valueOverReplacement) {
        return sum + parseFloat(player.advancedMetrics.valueOverReplacement);
      }
      return sum + 5; // Default value
    }, 0) / starters.length : 0;
  
  baseStats.benchStrength = bench.length > 0 ? 
    bench.reduce((sum, player) => {
      // Use advanced metrics if available, otherwise use basic stats
      if (player.advancedMetrics && player.advancedMetrics.valueOverReplacement) {
        return sum + parseFloat(player.advancedMetrics.valueOverReplacement);
      }
      return sum + 2; // Default value
    }, 0) / bench.length : 0;
  
  // Mock injury impact (would be calculated from actual injury data)
  baseStats.injuryImpact = (Math.random() * 10) - 5;
  
  // Calculate performance trend (random for now, would use actual game-by-game data)
  baseStats.performanceTrend = (Math.random() * 10) - 5;
  
  // League-specific team statistics
  switch(league) {
    case 'NBA':
      return {
        ...baseStats,
        offense: {
          pointsPerGame: aggregateAverage(players, 'stats.points', 5),
          fieldGoalPercentage: calculateFieldGoalPercentage(players),
          threePointPercentage: calculateThreePointPercentage(players),
          freeThrowPercentage: calculateFreeThrowPercentage(players),
          assistsPerGame: aggregateAverage(players, 'stats.assists', 5),
          reboundsPerGame: aggregateAverage(players, 'stats.rebounds', 5),
          turnoversPerGame: aggregateAverage(players, 'stats.turnovers', 5),
          offensiveRating: calculateOffensiveRating(players),
          pace: 90 + (Math.random() * 15)
        },
        defense: {
          opponentPointsPerGame: 100 + (Math.random() * 15) - 5,
          stealsPerGame: aggregateAverage(players, 'stats.steals', 5),
          blocksPerGame: aggregateAverage(players, 'stats.blocks', 5),
          defensiveRating: calculateDefensiveRating(players),
          defensiveReboundsPerGame: aggregateSpecificAverage(players, 'stats.defensiveRebounds', 'stats.rebounds', 0.7, 5)
        },
        advanced: {
          netRating: Math.random() * 20 - 10,
          effectiveFieldGoalPercentage: 0.45 + (Math.random() * 0.1),
          trueShootingPercentage: 0.53 + (Math.random() * 0.08),
          assistToTurnoverRatio: 1.5 + (Math.random() * 1),
          assistPercentage: 55 + (Math.random() * 15),
          reboundPercentage: 48 + (Math.random() * 5),
          playStyle: calculatePlayStyle(players, 'NBA'),
          strengthsAndWeaknesses: calculateStrengthsAndWeaknesses(players, 'NBA')
        }
      };
    
    case 'NFL':
      return {
        ...baseStats,
        offense: {
          pointsPerGame: 20 + (Math.random() * 10),
          yardsPerGame: 300 + (Math.random() * 150),
          passingYardsPerGame: aggregateSum(players, 'stats.passingYards') / baseStats.gamesPlayed,
          rushingYardsPerGame: aggregateSum(players, 'stats.rushingYards') / baseStats.gamesPlayed,
          turnoversPerGame: (aggregateSum(players, 'stats.passingInterceptions') + 
                            aggregateSum(players, 'stats.fumblesLost')) / baseStats.gamesPlayed,
          thirdDownConversionRate: 35 + (Math.random() * 15),
          redZoneEfficiency: 50 + (Math.random() * 20)
        },
        defense: {
          pointsAllowedPerGame: 20 + (Math.random() * 10),
          yardsAllowedPerGame: 300 + (Math.random() * 150),
          sacks: aggregateSum(players, 'stats.sacks'),
          interceptions: aggregateSum(players, 'stats.interceptions'),
          forcedFumbles: aggregateSum(players, 'stats.forcedFumbles') || Math.round(Math.random() * baseStats.gamesPlayed * 2),
          thirdDownStopRate: 55 + (Math.random() * 15),
          redZoneStopRate: 45 + (Math.random() * 20)
        },
        advanced: {
          offensiveEfficiency: (Math.random() * 30) - 5,
          defensiveEfficiency: (Math.random() * 30) - 5,
          specialTeamsEfficiency: (Math.random() * 20) - 10,
          playStyle: calculatePlayStyle(players, 'NFL'),
          strengthsAndWeaknesses: calculateStrengthsAndWeaknesses(players, 'NFL')
        }
      };
    
    case 'MLB':
      return {
        ...baseStats,
        offense: {
          runsPerGame: 4 + (Math.random() * 2),
          battingAverage: 0.240 + (Math.random() * 0.050),
          onBasePercentage: 0.310 + (Math.random() * 0.050),
          sluggingPercentage: 0.390 + (Math.random() * 0.070),
          homeRunsPerGame: aggregateSum(players, 'stats.homeRuns') / baseStats.gamesPlayed,
          strikeoutsPerGame: aggregateSum(players, 'stats.strikeouts') / baseStats.gamesPlayed,
          stolenBasesPerGame: aggregateSum(players, 'stats.stolenBases') / baseStats.gamesPlayed
        },
        pitching: {
          era: 3.50 + (Math.random() * 1.50),
          whip: 1.20 + (Math.random() * 0.30),
          strikeoutsPerNine: 8 + (Math.random() * 2),
          walksPerNine: 2.8 + (Math.random() * 1),
          hitsPerNine: 8 + (Math.random() * 2),
          homeRunsAllowedPerNine: 1 + (Math.random() * 0.5),
          qualityStartPercentage: 50 + (Math.random() * 20)
        },
        fielding: {
          fieldingPercentage: 0.980 + (Math.random() * 0.015),
          defensiveEfficiency: 0.68 + (Math.random() * 0.08),
          errorsPerGame: (Math.random() * 0.8),
          doublePlaysPerGame: (Math.random() * 1),
          outfieldAssists: Math.round(Math.random() * baseStats.gamesPlayed / 4)
        },
        advanced: {
          runDifferential: Math.round((Math.random() * 100) - 50),
          pythagoreanWinPercentage: Math.round(baseStats.winPercentage + (Math.random() * 10) - 5),
          babip: 0.290 + (Math.random() * 0.040),
          playStyle: calculatePlayStyle(players, 'MLB'),
          strengthsAndWeaknesses: calculateStrengthsAndWeaknesses(players, 'MLB')
        }
      };
    
    case 'NHL':
      return {
        ...baseStats,
        offense: {
          goalsPerGame: 2.7 + (Math.random() * 1),
          shotsPerGame: 29 + (Math.random() * 6),
          shootingPercentage: 8 + (Math.random() * 4),
          powerPlayPercentage: 18 + (Math.random() * 8),
          powerPlayGoalsPerGame: aggregateSum(players, 'stats.powerPlayGoals') / baseStats.gamesPlayed
        },
        defense: {
          goalsAgainstPerGame: 2.7 + (Math.random() * 1),
          shotsAgainstPerGame: 29 + (Math.random() * 6),
          savePercentage: 0.900 + (Math.random() * 0.040),
          penaltyKillPercentage: 78 + (Math.random() * 10),
          shutouts: aggregateSum(players, 'stats.shutouts') || Math.round(Math.random() * baseStats.gamesPlayed / 8)
        },
        possession: {
          faceoffPercentage: 48 + (Math.random() * 6),
          corsiPercentage: 48 + (Math.random() * 8),
          fenwickPercentage: 48 + (Math.random() * 8),
          hitsPerGame: aggregateSum(players, 'stats.hits') / baseStats.gamesPlayed,
          blockedShotsPerGame: aggregateSum(players, 'stats.blockedShots') / baseStats.gamesPlayed
        },
        advanced: {
          expectedGoalsPercentage: 48 + (Math.random() * 8),
          highDangerChancesPercentage: 48 + (Math.random() * 8),
          pdo: 98 + (Math.random() * 4),
          playStyle: calculatePlayStyle(players, 'NHL'),
          strengthsAndWeaknesses: calculateStrengthsAndWeaknesses(players, 'NHL')
        }
      };
    
    case 'PREMIER_LEAGUE':
    case 'LA_LIGA':
    case 'BUNDESLIGA':
    case 'SERIE_A':
      return {
        ...baseStats,
        attack: {
          goalsPerMatch: 1.2 + (Math.random() * 0.8),
          shotsPerMatch: 12 + (Math.random() * 6),
          shotsOnTargetPerMatch: 4 + (Math.random() * 3),
          shotsOnTargetPercentage: 30 + (Math.random() * 15),
          conversionRate: 8 + (Math.random() * 4),
          expectedGoalsPerMatch: 1.2 + (Math.random() * 0.8),
          bigChancesCreatedPerMatch: 1.5 + (Math.random() * 1)
        },
        defense: {
          goalsAgainstPerMatch: 1.2 + (Math.random() * 0.8),
          shotsAgainstPerMatch: 12 + (Math.random() * 6),
          shotsOnTargetAgainstPerMatch: 4 + (Math.random() * 3),
          tacklesPerMatch: aggregateSum(players, 'stats.tackles') / baseStats.gamesPlayed,
          interceptionPerMatch: aggregateSum(players, 'stats.interceptions') / baseStats.gamesPlayed,
          cleanSheets: aggregateSum(players, 'stats.cleanSheets') || Math.round(Math.random() * baseStats.gamesPlayed * 0.3)
        },
        possession: {
          possessionPercentage: 48 + (Math.random() * 10),
          passAccuracy: 78 + (Math.random() * 10),
          passesPerMatch: 400 + (Math.random() * 200),
          longBallsPerMatch: 40 + (Math.random() * 20),
          dribblesPerMatch: aggregateSum(players, 'stats.dribbles') / baseStats.gamesPlayed || 8 + (Math.random() * 4)
        },
        discipline: {
          yellowCardsPerMatch: aggregateSum(players, 'stats.yellowCards') / baseStats.gamesPlayed,
          redCardsPerMatch: aggregateSum(players, 'stats.redCards') / baseStats.gamesPlayed,
          foulsPerMatch: aggregateSum(players, 'stats.foulsCommitted') / baseStats.gamesPlayed
        },
        advanced: {
          expectedGoalsDifference: (Math.random() * 2) - 1,
          pressureSuccess: 25 + (Math.random() * 15),
          counterAttackGoalsPercentage: 15 + (Math.random() * 20),
          setPieceGoalsPercentage: 20 + (Math.random() * 15),
          playStyle: calculatePlayStyle(players, 'SOCCER'),
          strengthsAndWeaknesses: calculateStrengthsAndWeaknesses(players, 'SOCCER')
        }
      };
    
    default:
      return baseStats;
  }
}

/**
 * Calculate team play style based on player stats and metrics
 * @param {Array} players - Array of player objects with stats
 * @param {string} sportType - Type of sport
 * @returns {Object} Play style characteristics
 */
function calculatePlayStyle(players, sportType) {
  switch(sportType) {
    case 'NBA':
      // Calculate team's offensive tendencies
      const threePointAttempts = aggregateSum(players, 'stats.threePointersAttempted');
      const totalFieldGoalAttempts = aggregateSum(players, 'stats.fieldGoalsAttempted');
      const threePointRate = totalFieldGoalAttempts > 0 ? threePointAttempts / totalFieldGoalAttempts : 0;
      
      // Calculate fast break tendency
      const averageSpeed = players.reduce((sum, player) => {
        if (player.advancedMetrics && player.advancedMetrics.speed) {
          return sum + parseFloat(player.advancedMetrics.speed);
        }
        return sum + Math.random() * 10; // Default
      }, 0) / players.length;
      
      return {
        pace: threePointRate > 0.4 ? 'Fast-paced' : threePointRate > 0.3 ? 'Moderate' : 'Slow-paced',
        shootingTendency: threePointRate > 0.45 ? 'Three-point heavy' : threePointRate > 0.35 ? 'Balanced' : 'Inside focused',
        ballMovement: Math.random() > 0.5 ? 'High ball movement' : 'ISO-heavy',
        defensiveApproach: Math.random() > 0.5 ? 'Aggressive' : 'Conservative',
        reboundFocus: Math.random() > 0.5 ? 'Offensive rebounds' : 'Defensive rebounds',
        transitionSpeed: averageSpeed > 7 ? 'Fast break focused' : 'Half-court focused'
      };
    
    case 'NFL':
      // Determine offensive style (pass-heavy vs run-heavy)
      const passingYards = aggregateSum(players, 'stats.passingYards');
      const rushingYards = aggregateSum(players, 'stats.rushingYards');
      const passRatio = (passingYards + rushingYards) > 0 ? passingYards / (passingYards + rushingYards) : 0.5;
      
      return {
        offensiveStyle: passRatio > 0.65 ? 'Pass-heavy' : passRatio > 0.55 ? 'Balanced' : 'Run-heavy',
        passingDepth: Math.random() > 0.5 ? 'Deep passing' : 'Short passing',
        defensiveStyle: Math.random() > 0.5 ? 'Aggressive blitzing' : 'Coverage focused',
        redzoneApproach: Math.random() > 0.5 ? 'Aggressive' : 'Conservative',
        tempoStyle: Math.random() > 0.5 ? 'Up-tempo' : 'Ball control',
        formationVariety: Math.random() > 0.5 ? 'Multiple formations' : 'Base formation heavy'
      };
    
    case 'MLB':
      return {
        offensiveApproach: Math.random() > 0.5 ? 'Power hitting' : 'Contact hitting',
        baserunningStyle: Math.random() > 0.5 ? 'Aggressive' : 'Conservative',
        pitchingPhilosophy: Math.random() > 0.5 ? 'Power pitching' : 'Command and control',
        bullpenUsage: Math.random() > 0.5 ? 'Heavy' : 'Traditional',
        defensiveShifting: Math.random() > 0.5 ? 'Shift-heavy' : 'Traditional positioning',
        lineupConstruction: Math.random() > 0.5 ? 'Platoon-heavy' : 'Fixed lineup'
      };
    
    case 'NHL':
      return {
        offensiveStyle: Math.random() > 0.5 ? 'High-pressure forecheck' : 'Counterattack',
        defensiveSystem: Math.random() > 0.5 ? 'Man-to-man' : 'Zone defense',
        neutralZoneStrategy: Math.random() > 0.5 ? 'Aggressive' : 'Trap',
        powerPlayStyle: Math.random() > 0.5 ? 'Umbrella' : 'Overload',
        penaltyKillStyle: Math.random() > 0.5 ? 'Aggressive' : 'Passive box',
        tempoPreference: Math.random() > 0.5 ? 'High tempo' : 'Controlled'
      };
    
    case 'SOCCER':
      // Determine possession style
      const passAccuracy = players.reduce((sum, player) => {
        if (player.stats && player.stats.passesCompleted && player.stats.passesAttempted) {
          return sum + (player.stats.passesCompleted / player.stats.passesAttempted);
        }
        return sum + 0.7; // Default
      }, 0) / players.length;
      
      return {
        formationPreference: getRandomFormation(),
        possessionStyle: passAccuracy > 0.85 ? 'Possession-based' : passAccuracy > 0.75 ? 'Mixed' : 'Direct',
        pressingIntensity: Math.random() > 0.5 ? 'High press' : 'Mid/Low block',
        buildupPlay: Math.random() > 0.5 ? 'Build from back' : 'Direct play',
        attackingWidth: Math.random() > 0.5 ? 'Wide play' : 'Narrow',
        defensiveLineHeight: Math.random() > 0.5 ? 'High line' : 'Deep block',
        setpieceThreat: Math.random() > 0.4 ? 'Strong' : 'Average',
        counterAttackSpeed: Math.random() > 0.5 ? 'Fast transitions' : 'Controlled transitions'
      };
    
    default:
      return {
        style: 'Balanced',
        pace: 'Moderate',
        focus: 'Mixed'
      };
  }
}

/**
 * Calculate team strengths and weaknesses
 * @param {Array} players - Array of player objects
 * @param {string} sportType - Type of sport
 * @returns {Object} Team strengths and weaknesses
 */
function calculateStrengthsAndWeaknesses(players, sportType) {
  const strengthsCount = 2 + Math.floor(Math.random() * 2); // 2-3 strengths
  const weaknessesCount = 2 + Math.floor(Math.random() * 2); // 2-3 weaknesses
  
  let strengthsPool = [];
  let weaknessesPool = [];
  
  switch(sportType) {
    case 'NBA':
      strengthsPool = [
        'Three-point shooting', 'Interior defense', 'Ball movement',
        'Rebounding', 'Fast break offense', 'Perimeter defense',
        'Free throw shooting', 'Shot blocking', 'Depth', 'Star power'
      ];
      weaknessesPool = [
        'Turnovers', 'Rebounding', 'Perimeter defense', 'Interior defense',
        'Bench scoring', 'Free throw shooting', 'Three-point shooting',
        'Interior scoring', 'Health', 'Late game execution'
      ];
      break;
    
    case 'NFL':
      strengthsPool = [
        'Passing offense', 'Rushing offense', 'Passing defense',
        'Rushing defense', 'Special teams', 'Red zone efficiency',
        'Turnover margin', 'Third down offense', 'Third down defense',
        'Offensive line', 'Defensive line', 'Secondary coverage'
      ];
      weaknessesPool = [
        'Passing offense', 'Rushing offense', 'Passing defense',
        'Rushing defense', 'Special teams', 'Red zone efficiency',
        'Turnover margin', 'Third down offense', 'Third down defense',
        'Offensive line', 'Defensive line', 'Secondary coverage'
      ];
      break;
    
    case 'MLB':
      strengthsPool = [
        'Power hitting', 'Contact hitting', 'Starting pitching',
        'Bullpen', 'Defense', 'Base running', 'Strategic management',
        'Home field advantage', 'Situational hitting', 'Depth'
      ];
      weaknessesPool = [
        'Power hitting', 'Contact hitting', 'Starting pitching',
        'Bullpen', 'Defense', 'Base running', 'Strategic management',
        'Road performance', 'Situational hitting', 'Depth'
      ];
      break;
    
    case 'NHL':
      strengthsPool = [
        'Goal scoring', 'Defense', 'Goaltending', 'Power play',
        'Penalty kill', 'Faceoffs', 'Physicality', 'Speed',
        'Puck possession', 'Home ice advantage', 'Depth'
      ];
      weaknessesPool = [
        'Goal scoring', 'Defense', 'Goaltending', 'Power play',
        'Penalty kill', 'Faceoffs', 'Physicality', 'Speed',
        'Puck possession', 'Road performance', 'Depth'
      ];
      break;
    
    case 'SOCCER':
      strengthsPool = [
        'Attacking', 'Defending', 'Possession', 'Set pieces',
        'Counter-attacks', 'Pressing', 'Width play', 'Crossing',
        'Aerial duels', 'Home form', 'Squad depth', 'Technical ability'
      ];
      weaknessesPool = [
        'Attacking', 'Defending', 'Possession', 'Set pieces',
        'Counter-attacks', 'Pressing', 'Width play', 'Crossing',
        'Aerial duels', 'Away form', 'Squad depth', 'Tactical flexibility'
      ];
      break;
    
    default:
      strengthsPool = ['Offense', 'Defense', 'Teamwork', 'Coaching'];
      weaknessesPool = ['Consistency', 'Depth', 'Experience', 'Discipline'];
  }
  
  // Randomly select strengths and weaknesses
  const strengths = [];
  const weaknesses = [];
  
  // Ensure no overlap between strengths and weaknesses
  for (let i = 0; i < strengthsCount; i++) {
    if (strengthsPool.length > 0) {
      const index = Math.floor(Math.random() * strengthsPool.length);
      const strength = strengthsPool.splice(index, 1)[0];
      strengths.push(strength);
      
      // Remove from weaknesses pool if present
      const weaknessIndex = weaknessesPool.indexOf(strength);
      if (weaknessIndex !== -1) {
        weaknessesPool.splice(weaknessIndex, 1);
      }
    }
  }
  
  for (let i = 0; i < weaknessesCount; i++) {
    if (weaknessesPool.length > 0) {
      const index = Math.floor(Math.random() * weaknessesPool.length);
      weaknesses.push(weaknessesPool.splice(index, 1)[0]);
    }
  }
  
  return {
    strengths,
    weaknesses
  };
}

/**
 * Helper function to aggregate average value for a specific stat
 * @param {Array} players - Array of player objects
 * @param {string} statPath - Path to the stat in the player object (e.g., 'stats.points')
 * @param {number} playerCount - Expected number of players to contribute
 * @returns {number} Averaged stat value
 */
function aggregateAverage(players, statPath, playerCount = players.length) {
  let total = 0;
  let count = 0;
  
  players.forEach(player => {
    const stat = getNestedProperty(player, statPath);
    if (typeof stat === 'number') {
      total += stat;
      count++;
    }
  });
  
  return count > 0 ? (total / count) * Math.min(count, playerCount) / playerCount : 0;
}

/**
 * Helper function to aggregate sum of a specific stat
 * @param {Array} players - Array of player objects
 * @param {string} statPath - Path to the stat in the player object
 * @returns {number} Sum of the stat
 */
function aggregateSum(players, statPath) {
  let total = 0;
  
  players.forEach(player => {
    const stat = getNestedProperty(player, statPath);
    if (typeof stat === 'number') {
      total += stat;
    }
  });
  
  return total;
}

/**
 * Helper function for specialized averaging when a stat is derived from another stat
 * @param {Array} players - Array of player objects
 * @param {string} targetStatPath - Path to the target stat
 * @param {string} fallbackStatPath - Path to the fallback stat
 * @param {number} fallbackRatio - Ratio to apply to fallback stat
 * @param {number} playerCount - Expected number of players to contribute
 * @returns {number} Averaged stat value
 */
function aggregateSpecificAverage(players, targetStatPath, fallbackStatPath, fallbackRatio, playerCount = players.length) {
  let total = 0;
  let count = 0;
  
  players.forEach(player => {
    let stat = getNestedProperty(player, targetStatPath);
    
    // If target stat doesn't exist, try to derive it from the fallback stat
    if (typeof stat !== 'number') {
      const fallbackStat = getNestedProperty(player, fallbackStatPath);
      if (typeof fallbackStat === 'number') {
        stat = fallbackStat * fallbackRatio;
      }
    }
    
    if (typeof stat === 'number') {
      total += stat;
      count++;
    }
  });
  
  return count > 0 ? (total / count) * Math.min(count, playerCount) / playerCount : 0;
}

/**
 * Helper function to get nested property from an object using a path string
 * @param {Object} obj - Object to get property from
 * @param {string} path - Path to the property (e.g., 'stats.points')
 * @returns {*} Property value or undefined if not found
 */
function getNestedProperty(obj, path) {
  return path.split('.').reduce((prev, curr) => {
    return prev && prev[curr] !== undefined ? prev[curr] : undefined;
  }, obj);
}

/**
 * Calculate field goal percentage for NBA team
 * @param {Array} players - Array of player objects
 * @returns {number} Field goal percentage
 */
function calculateFieldGoalPercentage(players) {
  const made = aggregateSum(players, 'stats.fieldGoalsMade');
  const attempted = aggregateSum(players, 'stats.fieldGoalsAttempted');
  
  return attempted > 0 ? (made / attempted) * 100 : 0;
}

/**
 * Calculate three point percentage for NBA team
 * @param {Array} players - Array of player objects
 * @returns {number} Three point percentage
 */
function calculateThreePointPercentage(players) {
  const made = aggregateSum(players, 'stats.threePointersMade');
  const attempted = aggregateSum(players, 'stats.threePointersAttempted');
  
  return attempted > 0 ? (made / attempted) * 100 : 0;
}

/**
 * Calculate free throw percentage for NBA team
 * @param {Array} players - Array of player objects
 * @returns {number} Free throw percentage
 */
function calculateFreeThrowPercentage(players) {
  const made = aggregateSum(players, 'stats.freeThrowsMade');
  const attempted = aggregateSum(players, 'stats.freeThrowsAttempted');
  
  return attempted > 0 ? (made / attempted) * 100 : 0;
}

/**
 * Calculate offensive rating for NBA team
 * @param {Array} players - Array of player objects
 * @returns {number} Offensive rating
 */
function calculateOffensiveRating(players) {
  // Start with a base value
  let rating = 100;
  
  // Add contribution from player advanced metrics if available
  players.forEach(player => {
    if (player.advancedMetrics && player.advancedMetrics.offensiveRating) {
      rating += (parseFloat(player.advancedMetrics.offensiveRating) - 100) / players.length;
    }
  });
  
  // Add random variation
  rating += (Math.random() * 10) - 5;
  
  return Math.round(rating);
}

/**
 * Calculate defensive rating for NBA team
 * @param {Array} players - Array of player objects
 * @returns {number} Defensive rating
 */
function calculateDefensiveRating(players) {
  // Start with a base value
  let rating = 105;
  
  // Add contribution from player advanced metrics if available
  players.forEach(player => {
    if (player.advancedMetrics && player.advancedMetrics.defensiveRating) {
      rating += (parseFloat(player.advancedMetrics.defensiveRating) - 105) / players.length;
    }
  });
  
  // Add random variation
  rating += (Math.random() * 10) - 5;
  
  return Math.round(rating);
}

/**
 * Get a random soccer formation
 * @returns {string} Soccer formation
 */
function getRandomFormation() {
  const formations = [
    '4-3-3', '4-2-3-1', '4-4-2', '3-5-2', '3-4-3', 
    '5-3-2', '5-4-1', '4-1-4-1', '4-5-1', '4-3-2-1'
  ];
  
  return formations[Math.floor(Math.random() * formations.length)];
}

// Export the advanced metrics generation function for use in other modules
module.exports = {
  generateAdvancedMetrics: require('./metrics-utils').generateAdvancedMetrics
};

// Execute directly if run from command line
if (require.main === module) {
  updateMetrics()
    .then(() => {
      console.log('Player and team metrics update executed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Player and team metrics update failed:', error);
      process.exit(1);
    });
}// scripts/update-player-team-metrics.js
require('dotenv').config();
const { MongoClient } = require('mongodb');
const path = require('path');
const winston = require('winston');
const { format } = winston;

// Import the advanced metrics function
const { generateAdvancedMetrics } = require('./metrics-utils');

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json(),
    format.metadata()
  ),
  defaultMeta: { service: 'update-metrics' },
  transports: [
    new winston.transports.File({
      filename: 'error.log',
      level: 'error',
      maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE, 10) || 5000000,
      maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 3,
      tailable: true
    }),
    new winston.transports.File({
      filename: 'combined.log',
      maxsize: parseInt(process.env.LOG_FILE_MAX_SIZE, 10) || 5000000,
      maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 3,
      tailable: true
    }),
    new winston.transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      )
    })
  ]
});

// MongoDB connection details from .env
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://SportAnalytics:Studyhard%402034@cluster0.et16d.mongodb.net/sports-analytics?retryWrites=true&w=majority&appName=Cluster0';
const DB_NAME = process.env.MONGODB_DB_NAME || 'sports-analytics';

// Supported leagues
const SUPPORTED_LEAGUES = [
  'NFL', 'NBA', 'MLB', 'NHL',
  'PREMIER_LEAGUE', 'LA_LIGA', 'BUNDESLIGA', 'SERIE_A'
];

/**
 * Main function to update player and team metrics
 */
async function updateMetrics() {
  let client = null;
  try {
    // Connect to MongoDB
    client = await MongoClient.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE, 10) || 10,
      minPoolSize: parseInt(process.env.DB_MIN_POOL_SIZE, 10) || 1,
      connectTimeoutMS: parseInt(process.env.CONNECT_TIMEOUT_MS, 10) || 5000,
      socketTimeoutMS: parseInt(process.env.SOCKET_TIMEOUT_MS, 10) || 10000
    });
    
    logger.info('MongoDB connection established');
    
    const db = client.db(DB_NAME);
    
    for (const league of SUPPORTED_LEAGUES) {
      try {
        await updateLeagueMetrics(db, league);
      } catch (leagueError) {
        logger.error(`Error updating ${league} metrics:`, leagueError);
        // Continue with other leagues even if one fails
      }
    }
    
    logger.info('Metrics update completed successfully');
    
  } catch (error) {
    logger.error('Error in metrics update:', error);
    throw error;
  } finally {
    if (client) {
      await client.close();
      logger.info('MongoDB connection closed');
    }
  }
}

/**
 * Update player and team metrics for a specific league
 * @param {Object} db - MongoDB database instance
 * @param {string} league - League identifier
 */
async function updateLeagueMetrics(db, league) {
  try {
    logger.info(`Starting metrics update for ${league}`);
    
    // Player stats collection name
    const playerCollectionName = `${league.toLowerCase()}_player_stats`;
    const teamCollectionName = 'teams';
    
    // 1. Update player advanced metrics
    logger.info(`Updating advanced metrics for ${league} players`);
    
    // Get all players for this league
    const players = await db.collection(playerCollectionName).find({}).toArray();
    logger.info(`Found ${players.length} players in ${league}`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    // Process each player
    for (const player of players) {
      try {
        if (!player.stats || Object.keys(player.stats).length === 0) {
          skippedCount++;
          continue; // Skip players with no stats
        }
        
        // Generate advanced metrics using player stats and position
        const advancedMetrics = generateAdvancedMetrics(league, player.position, player.stats);
        
        // Update player with new advanced metrics
        const result = await db.collection(playerCollectionName).updateOne(
          { _id: player._id },
          { 
            $set: { 
              advancedMetrics: advancedMetrics,
              updatedAt: new Date()
            } 
          }
        );
        
        if (result.modifiedCount > 0) {
          updatedCount++;
        }
        
      } catch (playerError) {
        logger.warn(`Error updating metrics for player ${player.playerName || player._id}:`, playerError);
      }
    }
    
    logger.info(`Updated advanced metrics for ${updatedCount} players in ${league}, skipped ${skippedCount}`);
    
    // 2. Aggregate player stats to team level
    logger.info(`Aggregating team metrics for ${league}`);
    
    // Get all teams for this league
    const teams = await db.collection(teamCollectionName).find({ league }).toArray();
    
    for (const team of teams) {
      try {
        // Get all players for this team
        const teamPlayers = await db.collection(playerCollectionName).find({ 
          teamId: team.id.toLowerCase(), 
          league 
        }).toArray();
        
        if (teamPlayers.length === 0) {
          logger.warn(`No players found for team ${team.name} (${team.id})`);
          continue;
        }
        
        // Aggregate team statistics based on league
        const teamStats = calculateTeamStats(league, teamPlayers);
        
        // Update team with aggregated statistics
        await db.collection(teamCollectionName).updateOne(
          { _id: team._id },
          { 
            $set: { 
              stats: teamStats,
              playerCount: teamPlayers.length,
              updatedAt: new Date()
            } 
          }
        );
        
        logger.info(`Updated team metrics for ${team.name}`);
        
      } catch (teamError) {
        logger.error(`Error updating team metrics for ${team.name}:`, teamError);
      }
    }
    
    logger.info(`Completed metrics update for ${league}`);
    
  } catch (error) {
    logger.error(`Error updating metrics for ${league}:`, error);
    throw error;
  }
}

/**
 * Calculate aggregated team statistics based on player stats
 * @param {string} league - League identifier
 * @param {Array} players - Array of player objects with stats
 * @returns {Object} Aggregated team statistics
 */
function calculateTeamStats(league, players) {
  // Generic aggregated stats for any league
  const baseStats = {
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    winPercentage: 0,
    playerEfficiency: 0,
    teamChemistry: 0,
    starterImpact: 0,
    benchStrength: 0,
    injuryImpact: 0,
    performanceTrend: 0
  };
  
  // Get all unique games to count games played
  const gameIds = new Set();
  players.forEach(player => {
    if (player.gameId) {
      gameIds.add(player.gameId);
    }
  });
  
  baseStats.gamesPlayed = gameIds.size;
  
  // Calculate win percentage (placeholder - this would usually come from game results)
  baseStats.wins = Math.floor(baseStats.gamesPlayed * Math.random