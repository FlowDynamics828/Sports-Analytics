/**
 * Generate advanced analytics metrics based on league, position, and basic stats
 * This function creates realistic advanced metrics using common formulas from sports analytics
 * @param {string} league - League identifier
 * @param {string} position - Player position
 * @param {Object} stats - Basic player statistics 
 * @returns {Object} Advanced metrics object
 */
function generateAdvancedMetrics(league, position, stats) {
  // Include randomization with realistic distributions
  const normal = (mean, stdDev) => {
    // Box-Muller transform for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return z0 * stdDev + mean;
  };
  
  // Clamp value between min and max
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  
  // Create noise based on position and quality
  const createPositionalNoise = (baseValue, position, positionBonus) => {
    const positionFactor = position === positionBonus ? 1.2 : 0.9;
    return baseValue * positionFactor * (0.8 + Math.random() * 0.4);
  };
  
  switch(league) {
    case 'NBA':
      // Calculate realistic PER (Player Efficiency Rating)
      let per = normal(15, 5); // League average is 15
      if (position === 'C' || position === 'PF') per += normal(2, 1);
      if (stats.points > 20) per += normal(5, 2);
      per = clamp(per, 5, 32); // Historical PER range
      
      // Calculate true shooting percentage
      const pointsPerShot = stats.points / (stats.fieldGoalsAttempted + 0.44 * stats.freeThrowsAttempted);
      const trueShootingPct = clamp(pointsPerShot / 2, 0.42, 0.72);
      
      // Calculate offensive and defensive rating
      let offRating = 100 + normal(10, 5);
      if (stats.points > 15) offRating += normal(5, 2);
      if (stats.assists > 5) offRating += normal(3, 1);
      offRating = clamp(offRating, 80, 130);
      
      let defRating = 100 + normal(5, 10);
      if (stats.blocks > 1) defRating -= normal(3, 1);
      if (stats.steals > 1) defRating -= normal(2, 1);
      defRating = clamp(defRating, 90, 115);
      
      // Usage rate
      const usageRate = clamp(normal(20, 7), 8, 40);
      
      // Box Plus/Minus
      const bpm = clamp(normal(0, 4), -6, 12);
      
      // Value Over Replacement Player
      const vorp = clamp(stats.minutes * bpm * 0.002, -1, 8);
      
      // Win Shares
      const winShares = clamp(normal(3, 2), 0, 15);
      
      return {
        playerEfficiencyRating: per.toFixed(1),
        trueShootingPercentage: trueShootingPct.toFixed(3),
        effectiveFieldGoalPercentage: clamp((stats.fieldGoalsMade + 0.5 * stats.threePointersMade) / stats.fieldGoalsAttempted, 0.35, 0.70).toFixed(3),
        usageRate: usageRate.toFixed(1),
        offensiveRating: offRating.toFixed(1),
        defensiveRating: defRating.toFixed(1),
        netRating: (offRating - defRating).toFixed(1),
        assistPercentage: clamp(normal(15, 8), 2, 50).toFixed(1),
        reboundPercentage: clamp(normal(8, 4), 1, 25).toFixed(1),
        boxPlusMinus: bpm.toFixed(1),
        valueOverReplacement: vorp.toFixed(2),
        winShares: winShares.toFixed(1),
        winSharesPer48: (winShares / (stats.minutes / 48)).toFixed(3),
        offensiveWinShares: (winShares * normal(0.6, 0.1)).toFixed(1),
        defensiveWinShares: (winShares * normal(0.4, 0.1)).toFixed(1),
        gameScore: clamp(stats.points + 0.4 * stats.fieldGoalsMade - 0.7 * stats.fieldGoalsAttempted - 0.4 * (stats.freeThrowsAttempted - stats.freeThrowsMade) + 0.7 * stats.offensiveRebounds + 0.3 * stats.defensiveRebounds + stats.steals + 0.7 * stats.assists + 0.7 * stats.blocks - 0.4 * stats.personalFouls - stats.turnovers, 0, 40).toFixed(1)
      };
      
    case 'NFL':
      if (position === 'QB') {
        // Calculate passer rating using NFL formula
        const completionPercentage = stats.passingCompletions / stats.passingAttempts * 100;
        const yardsPerAttempt = stats.passingYards / stats.passingAttempts;
        const touchdownPercentage = stats.passingTouchdowns / stats.passingAttempts * 100;
        const interceptionPercentage = stats.passingInterceptions / stats.passingAttempts * 100;
        
        // Components of passer rating calculation
        const a = clamp((completionPercentage - 30) / 20, 0, 2.375);
        const b = clamp((yardsPerAttempt - 3) / 4, 0, 2.375);
        const c = clamp(touchdownPercentage / 5, 0, 2.375);
        const d = clamp(2.375 - (interceptionPercentage / 4), 0, 2.375);
        
        // Final passer rating
        const passerRating = ((a + b + c + d) / 6) * 100;
        
        // QBR (0-100 scale)
        const qbr = clamp(normal(50, 15), 20, 90);
        
        // Adjusted Net Yards per Attempt
        const anya = clamp((stats.passingYards + 20 * stats.passingTouchdowns - 45 * stats.passingInterceptions - 50 * stats.sacked) / (stats.passingAttempts + stats.sacked), 3, 9);
        
        return {
          passerRating: clamp(passerRating, 0, 158.3).toFixed(1),
          qbr: qbr.toFixed(1),
          completionPercentage: completionPercentage.toFixed(1),
          yardsPerAttempt: yardsPerAttempt.toFixed(1),
          adjustedYardsPerAttempt: ((stats.passingYards + 20 * stats.passingTouchdowns - 45 * stats.passingInterceptions) / stats.passingAttempts).toFixed(1),
          adjustedNetYardsPerAttempt: anya.toFixed(2),
          touchdownPercentage: touchdownPercentage.toFixed(1),
          interceptionPercentage: interceptionPercentage.toFixed(1),
          sackPercentage: stats.sacked ? (stats.sacked / (stats.passingAttempts + stats.sacked) * 100).toFixed(1) : "0.0",
          gameManagerIndex: clamp(normal(50, 15), 20, 90).toFixed(1),
          deepPassAccuracy: clamp(normal(40, 10), 15, 70).toFixed(1),
          pressurePerformance: clamp(normal(0, 0.5), -1, 1).toFixed(2),
          valueOverReplacement: clamp(normal(20, 15), -10, 60).toFixed(1),
          expectedPointsAdded: clamp(normal(50, 30), -20, 150).toFixed(1)
        };
      } 
      else if (position === 'RB') {
        return {
          yardsPerCarry: (stats.rushingYards / stats.rushingAttempts).toFixed(1),
          successRate: clamp(normal(45, 8), 30, 65).toFixed(1),
          yardsAfterContact: clamp(normal(2.5, 0.8), 1, 5).toFixed(1),
          brokenTacklesPerAttempt: clamp(normal(0.15, 0.05), 0.05, 0.3).toFixed(2),
          stuffedRunPercentage: clamp(normal(18, 5), 8, 30).toFixed(1),
          explosiveRunPercentage: clamp(normal(10, 4), 3, 20).toFixed(1),
          rushingDVOA: clamp(normal(0, 15), -30, 30).toFixed(1), // Defense-adjusted Value Over Average
          yardsPerRoute: clamp(normal(1.2, 0.5), 0.3, 2.5).toFixed(1),
          valueOverReplacement: clamp(normal(15, 10), -10, 40).toFixed(1),
          expectedPointsAdded: clamp(normal(15, 12), -15, 50).toFixed(1),
          rushingSuccessRate: clamp(normal(48, 6), 35, 60).toFixed(1),
          rushingExplosiveRate: clamp(normal(3.5, 1.5), 1, 8).toFixed(1),
          redZoneEfficiency: clamp(normal(0, 0.4), -1, 1).toFixed(2)
        };
      }
      else if (position === 'WR' || position === 'TE') {
        const catchRate = clamp(stats.receptions / (stats.targets || 1), 0.4, 0.85);
        
        return {
          yardsPerReception: (stats.receivingYards / stats.receptions).toFixed(1),
          yardsPerTarget: (stats.receivingYards / stats.targets).toFixed(1),
          catchRate: (catchRate * 100).toFixed(1) + '%',
          yardsAfterCatch: clamp(normal(4.5, 1.5), 2, 8).toFixed(1),
          droppedPassRate: clamp(normal(7, 3), 2, 15).toFixed(1) + '%',
          contestedCatchRate: clamp(normal(40, 10), 20, 70).toFixed(1) + '%',
          separationAverage: clamp(normal(2.7, 0.6), 1.5, 4.5).toFixed(1),
          targetShare: clamp(normal(15, 5), 5, 30).toFixed(1) + '%',
          routeRunSuccessRate: clamp(normal(65, 8), 45, 85).toFixed(1) + '%',
          valueOverReplacement: clamp(normal(15, 10), -5, 40).toFixed(1),
          receivingDVOA: clamp(normal(0, 15), -25, 35).toFixed(1),
          expectedPointsAdded: clamp(normal(20, 15), -10, 60).toFixed(1),
          redZoneTargetConversion: clamp(normal(30, 10), 10, 60).toFixed(1) + '%',
          receivingSuccessRate: clamp(normal(48, 7), 35, 65).toFixed(1) + '%'
        };
      }
      else if (position === 'OT' || position === 'OG' || position === 'C') {
        return {
          passBlockEfficiency: clamp(normal(95, 3), 80, 99).toFixed(1) + '%',
          passBlockingGrade: clamp(normal(75, 10), 50, 95).toFixed(1),
          runBlockingGrade: clamp(normal(75, 10), 50, 95).toFixed(1),
          pressuresAllowedRate: clamp(normal(5, 2), 1, 12).toFixed(1) + '%',
          penaltiesPerGame: clamp(normal(0.4, 0.2), 0, 1).toFixed(2),
          sackAllowedRate: clamp(normal(2, 1), 0, 5).toFixed(1) + '%',
          valueOverReplacement: clamp(normal(12, 8), -5, 35).toFixed(1),
          pffGrade: clamp(normal(70, 10), 45, 92).toFixed(1),
          snapsPerPenalty: clamp(normal(120, 40), 40, 250).toFixed(1),
          runBlockSuccessRate: clamp(normal(52, 7), 35, 70).toFixed(1) + '%',
          passBlockSuccessRate: clamp(normal(90, 4), 80, 98).toFixed(1) + '%',
          overallEfficiency: clamp(normal(85, 8), 65, 98).toFixed(1) + '%'
        };
      }
      else if (position === 'DE' || position === 'DT' || position === 'LB') {
        return {
          passRushProductivity: clamp(normal(6, 2), 2, 12).toFixed(1),
          runDefenseGrade: clamp(normal(75, 10), 50, 95).toFixed(1),
          passRushGrade: clamp(normal(75, 10), 50, 95).toFixed(1),
          missedTackleRate: clamp(normal(10, 3), 3, 20).toFixed(1) + '%',
          pressureRate: clamp(normal(10, 3), 4, 20).toFixed(1) + '%',
          stopRate: clamp(normal(8, 2), 3, 15).toFixed(1) + '%',
          valueOverReplacement: clamp(normal(15, 10), -5, 40).toFixed(1),
          pffGrade: clamp(normal(70, 10), 45, 92).toFixed(1),
          runStopPercentage: clamp(normal(8, 2), 3, 15).toFixed(1) + '%',
          tackleEfficiency: clamp(normal(85, 5), 70, 95).toFixed(1) + '%',
          passRushWinRate: clamp(normal(12, 4), 5, 25).toFixed(1) + '%',
          coverageGrade: position === 'LB' ? clamp(normal(65, 12), 40, 90).toFixed(1) : null,
          defenseExpectedPointsAdded: clamp(normal(15, 12), -10, 50).toFixed(1)
        };
      }
      else if (position === 'CB' || position === 'S') {
        return {
          passDefenseGrade: clamp(normal(75, 10), 50, 95).toFixed(1),
          coverageGrade: clamp(normal(75, 10), 50, 95).toFixed(1),
          missedTackleRate: clamp(normal(12, 4), 5, 25).toFixed(1) + '%',
          passer_rating_allowed: clamp(normal(95, 20), 50, 140).toFixed(1),
          reception_percentage: clamp(normal(65, 10), 40, 85).toFixed(1) + '%',
          yards_allowed_per_coverage_snap: clamp(normal(1.0, 0.3), 0.4, 1.8).toFixed(2),
          valueOverReplacement: clamp(normal(10, 8), -5, 35).toFixed(1),
          pffGrade: clamp(normal(70, 10), 45, 92).toFixed(1),
          targetsPerCoverageSnap: clamp(normal(0.12, 0.03), 0.05, 0.2).toFixed(3),
          ballHawkRate: clamp(normal(15, 5), 5, 30).toFixed(1) + '%',
          forcedIncompletionRate: clamp(normal(12, 4), 5, 25).toFixed(1) + '%',
          averageDepthOfTarget: clamp(normal(9, 3), 4, 18).toFixed(1),
          defenseExpectedPointsAdded: clamp(normal(10, 10), -15, 40).toFixed(1)
        };
      }
      else if (position === 'K' || position === 'P') {
        if (position === 'K') {
          return {
            fieldGoalPercentage: (stats.fieldGoalsMade / stats.fieldGoalsAttempted * 100).toFixed(1) + '%',
            extraPointPercentage: (stats.extraPointsMade / stats.extraPointsAttempted * 100).toFixed(1) + '%',
            kickoffTouchbackRate: clamp(normal(60, 15), 30, 90).toFixed(1) + '%',
            fieldGoalAccuracyUnder40: clamp(normal(90, 5), 75, 100).toFixed(1) + '%',
            fieldGoalAccuracy40to49: clamp(normal(75, 10), 50, 95).toFixed(1) + '%',
            fieldGoalAccuracyOver50: clamp(normal(60, 15), 30, 90).toFixed(1) + '%',
            valueOverReplacement: clamp(normal(5, 5), -5, 20).toFixed(1),
            kickingPointsAboveExpectation: clamp(normal(0, 5), -10, 15).toFixed(1),
            pressureKickingGrade: clamp(normal(75, 10), 50, 95).toFixed(1),
            kickoffHangTime: clamp(normal(3.8, 0.3), 3.2, 4.5).toFixed(2),
            kickingPointsAdded: clamp(normal(0, 8), -20, 20).toFixed(1)
          };
        } else {
          return {
            netPuntingAverage: clamp(normal(40, 3), 33, 47).toFixed(1),
            puntingGrade: clamp(normal(75, 10), 50, 95).toFixed(1),
            puntsInside20Percentage: (stats.puntsInside20 / stats.punts * 100).toFixed(1) + '%',
            touchbackPercentage: (stats.touchbacks / stats.punts * 100).toFixed(1) + '%',
            averageHangTime: clamp(normal(4.3, 0.3), 3.6, 5.0).toFixed(2),
            returnYardsAllowedPerPunt: clamp(normal(7, 2), 3, 12).toFixed(1),
            valueOverReplacement: clamp(normal(5, 5), -5, 15).toFixed(1),
            fieldPositionPercentageChange: clamp(normal(5, 3), 0, 12).toFixed(1) + '%',
            puntingPointsAdded: clamp(normal(0, 5), -10, 15).toFixed(1),
            directionalPuntingAccuracy: clamp(normal(70, 10), 50, 90).toFixed(1) + '%'
          };
        }
      }
      else {
        return {
          valueOverReplacement: clamp(normal(5, 5), -5, 20).toFixed(1),
          pffGrade: clamp(normal(70, 10), 45, 92).toFixed(1),
          specialTeamsGrade: clamp(normal(70, 8), 50, 90).toFixed(1),
          efficiencyRating: clamp(normal(65, 10), 40, 85).toFixed(1)
        };
      }
      
    case 'MLB':
      if (position === 'P') {
        // Calculate ERA+ (adjusted ERA)
        const eraPlus = clamp(100 * (4.5 / (parseFloat(stats.era) || 4.5)), 50, 200);
        
        // Calculate WHIP
        const whip = clamp((stats.hits + stats.walks) / parseFloat(stats.inningsPitched), 0.8, 2.0);
        
        // Calculate strikeout and walk rates
        const strikeoutsPerNine = clamp((stats.strikeouts * 9) / parseFloat(stats.inningsPitched), 4, 15);
        const walksPerNine = clamp((stats.walks * 9) / parseFloat(stats.inningsPitched), 0.5, 6);
        
        // Calculate FIP (Fielding Independent Pitching)
        const hr = stats.homeRuns || 1;
        const fip = clamp(((13 * hr) + (3 * stats.walks) - (2 * stats.strikeouts)) / parseFloat(stats.inningsPitched) + 3.1, 2, 6);
        
        return {
          whip: whip.toFixed(2),
          fieldingIndependentPitching: fip.toFixed(2),
          eraPlus: eraPlus.toFixed(0),
          strikeoutsPerNine: strikeoutsPerNine.toFixed(1),
          walksPerNine: walksPerNine.toFixed(1),
          strikeoutToWalkRatio: clamp(stats.strikeouts / (stats.walks || 1), 0.5, 10).toFixed(2),
          groundBallPercentage: clamp(normal(45, 8), 25, 65).toFixed(1) + '%',
          leftOnBasePercentage: clamp(normal(72, 5), 60, 85).toFixed(1) + '%',
          hardHitPercentage: clamp(normal(35, 7), 20, 55).toFixed(1) + '%',
          barrelPercentage: clamp(normal(7, 3), 2, 15).toFixed(1) + '%',
          swingingStrikeRate: clamp(normal(10, 3), 5, 18).toFixed(1) + '%',
          chaseRate: clamp(normal(30, 5), 20, 45).toFixed(1) + '%',
          contactRate: clamp(normal(80, 5), 65, 90).toFixed(1) + '%',
          zonePercentage: clamp(normal(45, 5), 35, 55).toFixed(1) + '%',
          firstPitchStrikePercentage: clamp(normal(60, 5), 50, 70).toFixed(1) + '%',
          valueOverReplacement: clamp(normal(2, 1.5), -1, 7).toFixed(1),
          winProbabilityAdded: clamp(normal(1, 1.5), -2, 5).toFixed(2)
        };
      } else {
        // Calculate slash line stats
        const battingAverage = parseFloat(stats.battingAverage) || stats.hits / stats.atBats;
        const onBasePercentage = parseFloat(stats.onBasePercentage) || 
          (stats.hits + stats.walks + (stats.hitByPitch || 0)) / 
          (stats.atBats + stats.walks + (stats.hitByPitch || 0) + (stats.sacrifices || 0));
        const sluggingPercentage = parseFloat(stats.sluggingPercentage) || 
          (stats.hits + stats.doubles + 2 * stats.triples + 3 * stats.homeRuns) / stats.atBats;
        
        // Calculate OPS and OPS+
        const ops = onBasePercentage + sluggingPercentage;
        const opsPlus = clamp(100 * (ops / 0.730), 40, 200);
        
        // Calculate wOBA (weighted On-Base Average)
        const woba = clamp(0.69 * stats.walks + 0.72 * (stats.hitByPitch || 0) + 0.88 * stats.singles + 
                    1.26 * stats.doubles + 1.60 * stats.triples + 2.00 * stats.homeRuns / 
                    (stats.atBats + stats.walks + (stats.hitByPitch || 0) + (stats.sacrifices || 0)), 0.250, 0.450);
        
        // Calculate ISO (Isolated Power)
        const iso = clamp(sluggingPercentage - battingAverage, 0.050, 0.350);
        
        return {
          battingAverage: battingAverage.toFixed(3),
          onBasePercentage: onBasePercentage.toFixed(3),
          sluggingPercentage: sluggingPercentage.toFixed(3),
          onBasePlusSlugging: ops.toFixed(3),
          opsPlus: opsPlus.toFixed(0),
          woba: woba.toFixed(3),
          weightedRunsCreated: clamp(normal(100, 20), 40, 180).toFixed(1),
          isolatedPower: iso.toFixed(3),
          babip: clamp(normal(0.300, 0.030), 0.230, 0.380).toFixed(3),
          strikeoutPercentage: clamp(normal(20, 5), 8, 35).toFixed(1) + '%',
          walkPercentage: clamp(normal(8, 2), 3, 15).toFixed(1) + '%',
          groundBallPercentage: clamp(normal(45, 8), 25, 65).toFixed(1) + '%',
          lineDrivePercentage: clamp(normal(20, 5), 10, 35).toFixed(1) + '%',
          flyBallPercentage: clamp(normal(35, 7), 20, 55).toFixed(1) + '%',
          hardHitPercentage: clamp(normal(35, 7), 20, 55).toFixed(1) + '%',
          barrelPercentage: clamp(normal(7, 3), 2, 15).toFixed(1) + '%',
          valueOverReplacement: clamp(normal(2, 1.5), -1, 7).toFixed(1),
          winProbabilityAdded: clamp(normal(1, 1.5), -2, 5).toFixed(2),
          baseRunningValue: clamp(normal(0, 2), -5, 8).toFixed(1),
          defensiveValue: clamp(normal(0, 5), -10, 15).toFixed(1)
        };
      }
      
    case 'NHL':
      if (position === 'G') {
        return {
          savePercentage: parseFloat(stats.savePercentage).toFixed(3) || (stats.saves / (stats.saves + stats.goalsAgainst)).toFixed(3),
          goalsAgainstAverage: parseFloat(stats.goalsAgainst || 0 / (stats.minutesPlayed / 60)).toFixed(2),
          qualityStartPercentage: clamp(normal(55, 10), 30, 80).toFixed(1) + '%',
          goalsAllowedPercentageRelative: clamp(normal(100, 10), 80, 120).toFixed(1),
          highDangerSavePercentage: clamp(normal(0.800, 0.050), 0.700, 0.900).toFixed(3),
          mediumDangerSavePercentage: clamp(normal(0.920, 0.030), 0.850, 0.950).toFixed(3),
          lowDangerSavePercentage: clamp(normal(0.975, 0.015), 0.940, 0.995).toFixed(3),
          shotsAgainstPerSixty: clamp(normal(30, 3), 23, 38).toFixed(1),
          rebound control rating: clamp(normal(70, 10), 50, 90).toFixed(1),
          goalsAllowedAboveExpected: clamp(normal(0, 8), -20, 20).toFixed(1),
          shutoutPercentage: clamp(stats.shutouts / Math.max(1, (stats.minutesPlayed / 60) / 60) * 100, 0, 30).toFixed(1) + '%',
          penaltySavePercentage: clamp(normal(0.85, 0.05), 0.75, 0.95).toFixed(3),
          valueAboveReplacement: clamp(normal(5, 5), -5, 20).toFixed(1),
          goalsAboveExpected: clamp(normal(0, 10), -20, 30).toFixed(1),
          quickness rating: clamp(normal(70, 10), 50, 90).toFixed(1),
          endurance rating: clamp(normal(70, 10), 50, 90).toFixed(1)
        };
      } else {
        // Calculate common advanced stats for skaters
        const pointsPer60 = clamp((stats.goals + stats.assists) / (stats.minutesPlayed / 60), 0, 4);
        
        let positionSpecific = {};
        if (position === 'D') {
          positionSpecific = {
            defensivePointShare: clamp(normal(3, 1.5), 0, 8).toFixed(1),
            blocksPer60: clamp(normal(6, 2), 2, 12).toFixed(1),
            takeAwaysPerGiveaways: clamp(normal(1, 0.3), 0.5, 2).toFixed(2),
            rushDefenseRating: clamp(normal(70, 10), 50, 90).toFixed(1),
            firstPassRating: clamp(normal(70, 10), 50, 90).toFixed(1),
            zoneExitSuccessRate: clamp(normal(70, 10), 50, 90).toFixed(1) + '%',
            blueLineRetention: clamp(normal(65, 12), 40, 85).toFixed(1) + '%',
            gapControlRating: clamp(normal(70, 10), 50, 90).toFixed(1)
          };
        } else if (position === 'C') {
          positionSpecific = {
            faceoffWinPercentage: clamp(normal(51, 5), 40, 65).toFixed(1) + '%',
            offensiveZoneFaceoffPercentage: clamp(normal(52, 6), 40, 70).toFixed(1) + '%',
            defensiveZoneFaceoffPercentage: clamp(normal(50, 6), 38, 65).toFixed(1) + '%',
            playDrivingRating: clamp(normal(70, 10), 50, 90).toFixed(1),
            foreCheckRating: clamp(normal(70, 10), 50, 90).toFixed(1),
            zoneEntrySuccessRate: clamp(normal(65, 10), 45, 85).toFixed(1) + '%',
            passSuccessRate: clamp(normal(75, 8), 60, 90).toFixed(1) + '%',
            highDangerPassesPerGame: clamp(normal(2.5, 1), 0.5, 5).toFixed(1)
          };
        } else { // LW/RW
          positionSpecific = {
            shotGenerationRate: clamp(normal(8, 2.5), 3, 15).toFixed(1),
            shootingPercentage: clamp(stats.goals / stats.shots * 100, 5, 25).toFixed(1) + '%',
            rushChancesCreated: clamp(normal(1.5, 0.6), 0.5, 3.5).toFixed(1),
            cycleChancesCreated: clamp(normal(1.2, 0.5), 0.3, 2.5).toFixed(1),
            foreCheckRating: clamp(normal(70, 10), 50, 90).toFixed(1),
            netFrontPresenceRating: clamp(normal(65, 12), 40, 85).toFixed(1),
            boardBattleWinPercentage: clamp(normal(52, 8), 40, 70).toFixed(1) + '%',
            highDangerShotPercentage: clamp(normal(20, 8), 10, 40).toFixed(1) + '%'
          };
        }
        
        return {
          pointsPer60: pointsPer60.toFixed(2),
          corsiPercentage: clamp(normal(50, 5), 40, 60).toFixed(1) + '%',
          corsiRelative: clamp(normal(0, 3), -6, 6).toFixed(1) + '%',
          expectedGoals: clamp(normal(stats.goals * 0.9, stats.goals * 0.3), stats.goals * 0.5, stats.goals * 1.5).toFixed(1),
          expectedGoalsPercentage: clamp(normal(50, 5), 40, 60).toFixed(1) + '%',
          highDangerChancesPercentage: clamp(normal(50, 6), 38, 62).toFixed(1) + '%',
          onIceShootingPercentage: clamp(normal(8.5, 1.5), 5, 12).toFixed(1) + '%',
          onIceSavePercentage: clamp(normal(91.5, 1.5), 88, 95).toFixed(1) + '%',
          pdo: clamp(normal(100, 2), 96, 104).toFixed(1),
          offensiveZoneStartPercentage: clamp(normal(50, 10), 30, 70).toFixed(1) + '%',
          primaryAssistsPerSixty: clamp(normal(0.8, 0.4), 0.1, 2).toFixed(2),
          secondaryAssistsPerSixty: clamp(normal(0.6, 0.3), 0.1, 1.5).toFixed(2),
          individualPointsPercentage: clamp(normal(70, 10), 50, 90).toFixed(1) + '%',
          gameScore: clamp(normal(0, 1), -3, 3).toFixed(2),
          valueAboveReplacement: clamp(normal(5, 3), -2, 15).toFixed(1),
          goalsAboveReplacement: clamp(normal(3, 5), -5, 15).toFixed(1),
          ...positionSpecific
        };
      }
    
    case 'PREMIER_LEAGUE':
    case 'LA_LIGA':
    case 'BUNDESLIGA':
    case 'SERIE_A':
      if (position === 'GK') {
        return {
          savePercentage: (stats.savePercentage || (stats.saves / (stats.saves + stats.goalsAgainst || 1) * 100)).toFixed(1) + '%',
          cleanSheetPercentage: (stats.cleanSheets ? (stats.cleanSheets / ((stats.minutesPlayed || 90) / 90)) * 100 : normal(30, 10)).toFixed(1) + '%',
          goalsAllowedPerMatch: (stats.goalsAgainst ? stats.goalsAgainst / ((stats.minutesPlayed || 90) / 90) : normal(1.2, 0.4)).toFixed(2),
          postShotExpectedGoalsMinus: clamp(normal(0, 3), -8, 8).toFixed(1),
          highClaimPercentage: clamp(normal(94, 3), 85, 99).toFixed(1) + '%',
          crossesStoppedPercentage: clamp(normal(8, 3), 3, 15).toFixed(1) + '%',
          averageDistanceOfDefensiveActionsOutsideBox: clamp(normal(13, 3), 7, 20).toFixed(1),
          passingAccuracy: clamp(normal(85, 5), 75, 95).toFixed(1) + '%',
          longPassAccuracy: clamp(normal(60, 10), 40, 80).toFixed(1) + '%',
          goalPreventionValue: clamp(normal(0, 0.2), -0.5, 0.5).toFixed(2),
          oneOnOneSavePercentage: clamp(normal(60, 10), 40, 80).toFixed(1) + '%',
          reflexRating: clamp(normal(75, 8), 60, 90).toFixed(1),
          commandOfAreaRating: clamp(normal(75, 8), 60, 90).toFixed(1),
          sweepingRating: clamp(normal(70, 10), 50, 90).toFixed(1),
          valueAboveReplacement: clamp(normal(5, 3), -2, 12).toFixed(1)
        };
      } 
      else if (position === 'CB' || position === 'RB' || position === 'LB') {
        let positionSpecific = {};
        if (position === 'CB') {
          positionSpecific = {
            aerialDuelsWonPercentage: clamp(normal(65, 8), 50, 85).toFixed(1) + '%',
            clearancesPerGame: clamp(normal(4.5, 1.5), 2, 8).toFixed(1),
            blocksShotPerGame: clamp(normal(0.8, 0.3), 0.3, 1.5).toFixed(1),
            dribbledPastPerGame: clamp(normal(0.6, 0.3), 0.1, 1.2).toFixed(1),
            longPassAccuracy: clamp(normal(60, 10), 40, 80).toFixed(1) + '%',
            defensePositioningRating: clamp(normal(75, 8), 60, 90).toFixed(1),
            zoneDefenseRating: clamp(normal(75, 8), 60, 90).toFixed(1)
          };
        } else { // Fullbacks
          positionSpecific = {
            crossesPerGame: clamp(normal(2.5, 1), 0.5, 5).toFixed(1),
            crossAccuracy: clamp(normal(25, 8), 10, 45).toFixed(1) + '%',
            dribblesPerGame: clamp(normal(1.2, 0.5), 0.3, 2.5).toFixed(1),
            dribbleSuccessRate: clamp(normal(55, 10), 35, 75).toFixed(1) + '%',
            overlappingRunsPerGame: clamp(normal(2.2, 0.8), 0.8, 4).toFixed(1),
            progressiveRunsPerGame: clamp(normal(1.8, 0.7), 0.5, 3.5).toFixed(1),
            recoverySpeed: clamp(normal(80, 8), 65, 95).toFixed(1)
          };
        }
        
        return {
          tacklesPerGame: clamp(normal(2.5, 0.8), 1, 4.5).toFixed(1),
          interceptionsPerGame: clamp(normal(1.5, 0.5), 0.5, 3).toFixed(1),
          tackleSuccessRate: clamp(normal(70, 10), 50, 90).toFixed(1) + '%',
          duelsWonPercentage: clamp(normal(60, 8), 45, 75).toFixed(1) + '%',
          pressureSuccessRate: clamp(normal(30, 8), 15, 50).toFixed(1) + '%',
          errorLeadingToShotPerGame: clamp(normal(0.1, 0.05), 0, 0.3).toFixed(2),
          passAccuracy: clamp(normal(82, 5), 70, 92).toFixed(1) + '%',
          progressivePassesPerGame: clamp(normal(4, 1.5), 1.5, 8).toFixed(1),
          expectedGoalChainPerGame: clamp(normal(0.15, 0.08), 0.05, 0.4).toFixed(2),
          defenseActionSuccess: clamp(normal(70, 8), 55, 85).toFixed(1) + '%',
          recoveryPerGame: clamp(normal(8, 2), 4, 12).toFixed(1),
          valueAboveReplacement: clamp(normal(5, 3), -2, 12).toFixed(1),
          ...positionSpecific
        };
      }
      else if (position === 'CDM' || position === 'CM') {
        let positionSpecific = {};
        if (position === 'CDM') {
          positionSpecific = {
            interruptionsPerGame: clamp(normal(2.2, 0.7), 1, 4).toFixed(1),
            ballRecoveriesPerGame: clamp(normal(7, 2), 4, 12).toFixed(1),
            defensiveAwarenessRating: clamp(normal(80, 8), 65, 95).toFixed(1),
            defensiveDuelsWonPercentage: clamp(normal(62, 8), 45, 75).toFixed(1) + '%',
            coveringSpaceRating: clamp(normal(75, 8), 60, 90).toFixed(1),
            counterPressSuccessRate: clamp(normal(60, 10), 40, 80).toFixed(1) + '%'
          };
        } else { // Box-to-box CM
          positionSpecific = {
            forwardPassesPerGame: clamp(normal(25, 8), 15, 45).toFixed(1),
            progressivePassesPerGame: clamp(normal(8, 3), 3, 15).toFixed(1),
            finalThirdPassesPerGame: clamp(normal(6, 2), 2, 12).toFixed(1),
            ballCarryingDistance: clamp(normal(150, 50), 80, 300).toFixed(1),
            pressureRegainTimeSeconds: clamp(normal(6, 1.5), 3, 10).toFixed(1),
            stamina: clamp(normal(85, 5), 75, 95).toFixed(1)
          };
        }
        
        return {
          passesPerGame: clamp(normal(60, 15), 35, 100).toFixed(1),
          passAccuracy: clamp(normal(85, 5), 75, 95).toFixed(1) + '%',
          keyPassesPerGame: clamp(normal(1.2, 0.6), 0.3, 3).toFixed(1),
          longPassAccuracy: clamp(normal(70, 10), 50, 85).toFixed(1) + '%',
          tacklesPerGame: clamp(normal(2.3, 0.8), 1, 4).toFixed(1),
          interceptionsPerGame: clamp(normal(1.3, 0.5), 0.5, 2.5).toFixed(1),
          pressuresPerGame: clamp(normal(20, 5), 12, 35).toFixed(1),
          successfulPressurePercentage: clamp(normal(30, 5), 20, 45).toFixed(1) + '%',
          progressiveCarriesPerGame: clamp(normal(2, 1), 0.5, 5).toFixed(1),
          expectedGoalInvolvementPerGame: clamp(normal(0.2, 0.1), 0.05, 0.5).toFixed(2),
          valueAboveReplacement: clamp(normal(5, 3), -2, 12).toFixed(1),
          possessionRegainValue: clamp(normal(0, 0.2), -0.5, 0.5).toFixed(2),
          fieldControlPercentage: clamp(normal(8, 3), 3, 15).toFixed(1) + '%',
          ...positionSpecific
        };
      }
      else if (position === 'CAM' || position === 'RW' || position === 'LW') {
        let positionSpecific = {};
        if (position === 'CAM') {
          positionSpecific = {
            throughBallsPerGame: clamp(normal(1.5, 0.7), 0.5, 3.5).toFixed(1),
            passIntoBoxPerGame: clamp(normal(2.5, 1), 1, 5).toFixed(1),
            turnoverInDangerousAreasPerGame: clamp(normal(1.5, 0.6), 0.5, 3).toFixed(1),
            creativePassingIndex: clamp(normal(75, 12), 50, 95).toFixed(1),
            visionRating: clamp(normal(80, 8), 65, 95).toFixed(1),
            offTheBallMovementRating: clamp(normal(75, 8), 60, 90).toFixed(1)
          };
        } else { // Wingers
          positionSpecific = {
            successfulCrossesPerGame: clamp(normal(1.2, 0.6), 0.3, 3).toFixed(1),
            dribbleAttemptsPerGame: clamp(normal(5, 2), 2, 10).toFixed(1),
            dribbleSuccessRate: clamp(normal(55, 10), 35, 75).toFixed(1) + '%',
            accelerationRating: clamp(normal(80, 8), 65, 95).toFixed(1),
            oneOnOneWinRatio: clamp(normal(55, 10), 35, 75).toFixed(1) + '%',
            cutBacksPerGame: clamp(normal(1.2, 0.6), 0.3, 3).toFixed(1),
            chancesCreatedFromWideAreas: clamp(normal(1.8, 0.8), 0.5, 4).toFixed(1)
          };
        }
        
        return {
          goalsPerGame: clamp(stats.goals / (stats.minutesPlayed / 90), 0, 1).toFixed(2),
          assistsPerGame: clamp(stats.assists / (stats.minutesPlayed / 90), 0, 0.8).toFixed(2),
          keyPassesPerGame: clamp(normal(2, 0.8), 0.8, 4).toFixed(1),
          shotsPerGame: clamp(normal(2.5, 1), 1, 5).toFixed(1),
          shotAccuracy: clamp(normal(45, 10), 25, 65).toFixed(1) + '%',
          expectedGoalsPerGame: clamp(normal(0.35, 0.15), 0.1, 0.8).toFixed(2),
          expectedAssistsPerGame: clamp(normal(0.25, 0.12), 0.05, 0.6).toFixed(2),
          dribblesPerGame: clamp(normal(3, 1.5), 1, 7).toFixed(1),
          progressiveCarriesPerGame: clamp(normal(4, 1.5), 1.5, 8).toFixed(1),
          offensiveDuelsWonPercentage: clamp(normal(50, 8), 35, 70).toFixed(1) + '%',
          touchesInBox: clamp(normal(4, 1.5), 1.5, 8).toFixed(1),
          pressuresInFinalThird: clamp(normal(5, 2), 2, 10).toFixed(1),
          ballRecoveriesInFinalThird: clamp(normal(2, 1), 0.5, 4).toFixed(1),
          valueAboveReplacement: clamp(normal(5, 3), -2, 12).toFixed(1),
          chanceCreationValue: clamp(normal(0, 0.2), -0.5, 0.5).toFixed(2),
          ...positionSpecific
        };
      }
      else if (position === 'ST') {
        return {
          goalsPerGame: clamp(stats.goals / (stats.minutesPlayed / 90), 0, 1).toFixed(2),
          shotsPerGame: clamp(normal(3, 1), 1.5, 6).toFixed(1),
          shotsOnTargetPercentage: clamp(normal(45, 10), 25, 65).toFixed(1) + '%',
          conversionRate: clamp(normal(15, 5), 5, 30).toFixed(1) + '%',
          expectedGoalsPerGame: clamp(normal(0.45, 0.15), 0.2, 0.9).toFixed(2),
          expectedGoalsDifference: clamp(normal(0, 0.3), -0.6, 0.6).toFixed(2),
          touchesInBox: clamp(normal(5, 1.5), 2, 9).toFixed(1),
          aerialDuelsWonPercentage: clamp(normal(50, 10), 30, 70).toFixed(1) + '%',
          holdup play rating: clamp(normal(70, 10), 50, 90).toFixed(1),
          linkup play involvement: clamp(normal(15, 5), 5, 30).toFixed(1) + '%',
          pressuresPerGame: clamp(normal(12, 4), 5, 20).toFixed(1),
          distanceCoveredKm: clamp(normal(9.5, 1), 7.5, 12).toFixed(1),
          valueAboveReplacement: clamp(normal(5, 3), -2, 12).toFixed(1),
          goalScoringValue: clamp(normal(0, 0.2), -0.5, 0.5).toFixed(2),
          nonPenaltyGoalsPerGame: clamp((stats.goals - (stats.penalties || 0)) / (stats.minutesPlayed / 90), 0, 1).toFixed(2),
          headerGoalsPercentage: clamp(normal(20, 8), 5, 40).toFixed(1) + '%',
          goalOpenPlayPercentage: clamp(normal(70, 10), 50, 90).toFixed(1) + '%',
          shotLocation: {
            insideBox: clamp(normal(75, 8), 60, 90).toFixed(1) + '%',
            outsideBox: clamp(normal(25, 8), 10, 40).toFixed(1) + '%'
          },
          goalsByZone: {
            central: clamp(normal(60, 10), 40, 80).toFixed(1) + '%',
            leftSide: clamp(normal(20, 8), 5, 35).toFixed(1) + '%',
            rightSide: clamp(normal(20, 8), 5, 35).toFixed(1) + '%'
          }
        };
      }
      else {
        return {
          valueAboveReplacement: clamp(normal(5, 3), -2, 12).toFixed(1),
          matchRating: clamp(normal(6.8, 0.5), 5.5, 8.0).toFixed(1)
        };
      }
      
    default:
      // Generic advanced metrics for any sport
      return {
        performanceIndex: clamp(normal(70, 15), 40, 95).toFixed(1),
        valueOverReplacement: clamp(normal(5, 3), -3, 15).toFixed(1),
        efficiency: clamp(normal(75, 10), 50, 95).toFixed(1) + '%',
        consistencyRating: clamp(normal(70, 10), 50, 90).toFixed(1),
        impactScore: clamp(normal(65, 15), 35, 90).toFixed(1)
      };
  }
}

module.exports = {
  generateAdvancedMetrics
};

