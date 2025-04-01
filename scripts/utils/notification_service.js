/**
 * Advanced Notification Service
 * 
 * Enterprise-grade notification delivery service with AI-powered optimization for sports analytics.
 * 
 * Supports multiple leagues:
 * - NBA (National Basketball Association)
 * - NHL (National Hockey League)
 * - NFL (National Football League)
 * - MLB (Major League Baseball)
 * - La Liga (Spanish Football League)
 * - Serie A (Italian Football League)
 * - Premier League (English Football League)
 * - Bundesliga (German Football League)
 * 
 * Delivery Channels:
 * - Email notifications
 * - Web notifications (browser)
 * - Mobile push notifications
 * - SMS text messages
 * - API webhooks
 * - Slack/Teams/Discord integrations
 * - WhatsApp Business API
 * 
 * Advanced Features:
 * - ML-based delivery time optimization
 * - Multivariate testing framework
 * - Intent-based notification grouping
 * - Context-aware notification prioritization
 * - Progressive content delivery
 * - GDPR/CCPA compliance
 * - Channel fallback orchestration
 * - Sentiment analysis for tone adjustment
 * - Comprehensive metrics and analytics
 * - A/B testing framework
 */

// Core dependencies
const nodemailer = require('nodemailer');
const redis = require('redis');
const crypto = require('crypto');
const logger = require('./logger');
const fs = require('fs').promises;
const path = require('path');

// ML and advanced analytics dependencies
const { SentimentAnalyzer   
  /**
   * Get optimal delivery time based on ML predictions
   * @param {Object} notification Notification data
   * @param {string} userId User ID
   * @param {Object} userProfile User profile data
   * @returns {Promise<number>} Optimal delivery timestamp
   * @private
   */
  async getOptimalDeliveryTime(notification, userId, userProfile = null) {
    if (!this.mlConfig.enabled || !this.mlService) {
      // If ML is not enabled, deliver immediately
      return Date.now();
    }
    
    try {
      const userTz = userProfile?.timezone || this.timeZoneDefault;
      
      // Get user activity patterns from ML service
      const optimalTime = await this.mlService.predictOptimalDeliveryTime({
        userId,
        intent: notification.intent,
        priority: notification.priority,
        league: notification.league,
        timezone: userTz
      });
      
      // For critical notifications, deliver immediately
      if (notification.priority === PRIORITY.CRITICAL || 
          notification.priority === PRIORITY.BREAKING) {
        return Date.now();
      }
      
      // If prediction is too far in the future (more than 12 hours), cap it
      const maxDelay = 12 * 60 * 60 * 1000; // 12 hours
      const cappedTime = Math.min(optimalTime, Date.now() + maxDelay);
      
      return cappedTime;
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error predicting delivery time: ${error.message}`);
      // On error, default to immediate delivery
      return Date.now();
    }
  }
  
  /**
   * Analyze notification sentiment and adjust content accordingly
   * @param {Object} notification Notification data
   * @returns {Promise<void>}
   * @private
   */
  async analyzeNotificationSentiment(notification) {
    if (!this.sentimentConfig.enabled || !this.sentimentAnalyzer) {
      return;
    }
    
    try {
      // Combine title and message for analysis
      const text = `${notification.title} ${notification.message || ''}`;
      
      // Analyze sentiment
      const sentimentScore = await this.sentimentAnalyzer.analyze(text);
      
      // Determine sentiment category based on thresholds
      let sentiment = SENTIMENT.NEUTRAL;
      if (sentimentScore <= this.sentimentConfig.sentimentThresholds[SENTIMENT.VERY_NEGATIVE]) {
        sentiment = SENTIMENT.VERY_NEGATIVE;
      } else if (sentimentScore <= this.sentimentConfig.sentimentThresholds[SENTIMENT.NEGATIVE]) {
        sentiment = SENTIMENT.NEGATIVE;
      } else if (sentimentScore >= this.sentimentConfig.sentimentThresholds[SENTIMENT.VERY_POSITIVE]) {
        sentiment = SENTIMENT.VERY_POSITIVE;
      } else if (sentimentScore >= this.sentimentConfig.sentimentThresholds[SENTIMENT.POSITIVE]) {
        sentiment = SENTIMENT.POSITIVE;
      }
      
      // Set sentiment in notification
      notification.sentiment = sentiment;
      notification.sentimentScore = sentimentScore;
      
      // If tone adjustment is enabled, modify content based on sentiment
      if (this.sentimentConfig.adjustTone) {
        this.adjustNotificationTone(notification);
      }
    } catch (error) {
      logger.error(`AdvancedNotificationService: Sentiment analysis error: ${error.message}`);
    }
  }
  
  /**
   * Adjust notification tone based on sentiment
   * @param {Object} notification Notification data
   * @private
   */
  adjustNotificationTone(notification) {
    // Don't adjust tone for grouped notifications
    if (notification.isGrouped) {
      return;
    }
    
    try {
      switch (notification.sentiment) {
        case SENTIMENT.VERY_NEGATIVE:
          // For very negative news, add a softer introduction
          if (!notification.message?.startsWith('Update:')) {
            notification.message = `Update: ${notification.message || ''}`;
          }
          break;
          
        case SENTIMENT.NEGATIVE:
          // For negative news, add context if available
          if (notification.data && notification.data.context && 
              !notification.message?.includes(notification.data.context)) {
            notification.message = `${notification.message || ''}\n\nContext: ${notification.data.context}`;
          }
          break;
          
        case SENTIMENT.VERY_POSITIVE:
          // For very positive news, add enthusiasm
          if (!notification.title.includes('!')) {
            notification.title = `${notification.title}!`;
          }
          break;
      }
    } catch (error) {
      logger.error(`AdvancedNotificationService: Tone adjustment error: ${error.message}`);
    }
  }
  
  /**
   * Classify notification intent using NLP
   * @param {Object} notification Notification data
   * @returns {Promise<Object>} Intent classification result
   * @private
   */
  async classifyNotificationIntent(notification) {
    try {
      if (!this.nlpManager) {
        // Default to a generic intent if NLP is not available
        return { intent: INTENT.TECHNICAL, confidence: 1.0 };
      }
      
      // Combine title and message for classification
      const text = `${notification.title} ${notification.message || ''}`;
      
      // Classify using NLP manager
      const result = await this.nlpManager.process('en', text);
      
      if (result.intent && result.score > 0.5) {
        return { intent: result.intent, confidence: result.score };
      }
      
      // Use data hints if available
      if (notification.data) {
        if (notification.data.gameId) {
          if (notification.data.isStarting) {
            return { intent: INTENT.GAME_START, confidence: 1.0 };
          } else if (notification.data.isEnding) {
            return { intent: INTENT.GAME_END, confidence: 1.0 };
          } else {
            return { intent: INTENT.SCORE_UPDATE, confidence: 0.9 };
          }
        } else if (notification.data.playerId) {
          return { intent: INTENT.PLAYER_PERFORMANCE, confidence: 0.9 };
        } else if (notification.data.teamId) {
          return { intent: INTENT.TEAM_NEWS, confidence: 0.8 };
        } else if (notification.data.injuryReport) {
          return { intent: INTENT.INJURY_UPDATE, confidence: 1.0 };
        } else if (notification.data.transferNews) {
          return { intent: INTENT.TRANSFER_NEWS, confidence: 1.0 };
        } else if (notification.data.odds) {
          return { intent: INTENT.BETTING_ODDS, confidence: 1.0 };
        } else if (notification.data.fantasyPoints) {
          return { intent: INTENT.FANTASY_ALERT, confidence: 1.0 };
        }
      }
      
      // Default to technical intent if no match found
      return { intent: INTENT.TECHNICAL, confidence: 0.5 };
    } catch (error) {
      logger.error(`AdvancedNotificationService: Intent classification error: ${error.message}`);
      return { intent: INTENT.TECHNICAL, confidence: 1.0 };
    }
  }
  
  /**
   * Detect league from entity ID (team or player)
   * @param {string} entityId Team or player ID
   * @param {string} entityType Type of entity ('team' or 'player')
   * @returns {Promise<string|null>} League identifier
   * @private
   */
  async detectLeagueFromEntityId(entityId, entityType) {
    try {
      if (!this.sportsDataClient) {
        return null;
      }
      
      return await this.sportsDataClient.detectEntityLeague(entityId, entityType);
    } catch (error) {
      logger.error(`AdvancedNotificationService: League detection error: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Determine optimal notification channels for a user
   * @param {Object} notification Notification data
   * @param {Object} userProfile User profile data
   * @returns {Array<string>} Optimal channels
   * @private
   */
  determineOptimalChannels(notification, userProfile) {
    try {
      // If user has specific channel preferences, use those
      if (userProfile?.channelPreferences) {
        const preferences = userProfile.channelPreferences;
        
        // Check preferences for this specific intent
        if (notification.intent && preferences[notification.intent]) {
          return preferences[notification.intent];
        }
        
        // Check preferences for this league
        if (notification.league && preferences[notification.league]) {
          return preferences[notification.league];
        }
        
        // Check preferences for this priority
        if (notification.priority && preferences[notification.priority]) {
          return preferences[notification.priority];
        }
        
        // Use default preferences if available
        if (preferences.default && Array.isArray(preferences.default)) {
          return preferences.default;
        }
      }
      
      // Otherwise, use priority-based defaults
      switch (notification.priority) {
        case PRIORITY.CRITICAL:
        case PRIORITY.BREAKING:
          return [CHANNELS.MOBILE, CHANNELS.SMS, CHANNELS.EMAIL];
          
        case PRIORITY.HIGH:
          return [CHANNELS.MOBILE, CHANNELS.EMAIL];
          
        case PRIORITY.MEDIUM:
          return [CHANNELS.MOBILE, CHANNELS.WEB];
          
        case PRIORITY.LOW:
          return [CHANNELS.WEB];
          
        case PRIORITY.PERSONALIZED:
          return [CHANNELS.MOBILE, CHANNELS.EMAIL];
          
        default:
          // Check league-specific defaults
          if (notification.league && this.leagueConfig[notification.league]) {
            return this.leagueConfig[notification.league].defaultChannels;
          }
          
          // Default to web notifications
          return [CHANNELS.WEB];
      }
    } catch (error) {
      logger.error(`AdvancedNotificationService: Channel determination error: ${error.message}`);
      return [CHANNELS.WEB]; // Most reliable default
    }
  }
  
  /**
   * Prepare progressive content delivery
   * @param {Object} notification Notification data
   * @returns {Object} Processed notification with progressive content
   * @private
   */
  prepareProgressiveContent(notification) {
    try {
      // Only process non-grouped notifications with sufficient content
      if (notification.isGrouped || !notification.message || notification.message.length <= this.progressiveDeliveryConfig.summaryMaxLength) {
        return notification;
      }
      
      const processedNotification = { ...notification };
      
      // Generate a summary from the full message
      processedNotification.summary = this.generateSummary(notification.message, this.progressiveDeliveryConfig.summaryMaxLength);
      
      // Store full content separately
      processedNotification.fullContent = notification.message;
      
      // Replace message with summary
      processedNotification.message = processedNotification.summary;
      
      return processedNotification;
    } catch (error) {
      logger.error(`AdvancedNotificationService: Progressive content error: ${error.message}`);
      return notification; // Return original on error
    }
  }
  
  /**
   * Generate a summary of text
   * @param {string} text Full text to summarize
   * @param {number} maxLength Maximum summary length
   * @returns {string} Summary text
   * @private
   */
  generateSummary(text, maxLength) {
    // Simple summarization: take first N characters and append ellipsis
    if (text.length <= maxLength) {
      return text;
    }
    
    // Find a good breaking point (end of sentence or space)
    let breakPoint = maxLength;
    while (breakPoint > maxLength - 20) {
      if (text.charAt(breakPoint) === '.' || text.charAt(breakPoint) === '!' || text.charAt(breakPoint) === '?') {
        breakPoint++; // Include the punctuation
        break;
      }
      breakPoint--;
    }
    
    // If no good sentence break found, look for space
    if (breakPoint <= maxLength - 20) {
      breakPoint = text.lastIndexOf(' ', maxLength);
    }
    
    // If still no good break found, just cut at maxLength
    if (breakPoint <= 0) {
      breakPoint = maxLength;
    }
    
    return text.substring(0, breakPoint) + '...';
  }
  
  /**
   * Execute channel fallback orchestration
   * @param {Object} notification Notification data
   * @param {string} userId User ID
   * @param {Array<string>} attemptedChannels Channels already attempted
   * @param {Object} userProfile User profile data
   * @returns {Promise<Object>} Fallback delivery results
   * @private
   */
  async executeChannelFallback(notification, userId, attemptedChannels, userProfile) {
    if (!this.fallbackConfig.enabled) {
      return { success: false, reason: 'fallback_disabled' };
    }
    
    try {
      // Get fallback chain for this priority level
      const fallbackChain = this.getChannelFallbackChain(notification, attemptedChannels);
      
      if (!fallbackChain || fallbackChain.length === 0) {
        return { success: false, reason: 'no_fallback_available' };
      }
      
      logger.info(`AdvancedNotificationService: Executing fallback for ${userId}, channels: ${fallbackChain.join(', ')}`);
      
      // Record fallback metric
      this.metricsCollector.recordMetric('channel_fallback_executed', 1, {
        userId,
        notificationId: notification.id,
        originalChannels: attemptedChannels.join(','),
        fallbackChannels: fallbackChain.join(',')
      });
      
      const results = {
        success: false,
        channels: {},
        successfulChannels: [],
        failedChannels: []
      };
      
      // Try each fallback channel in sequence
      for (const channel of fallbackChain) {
        // Skip if channel was already attempted
        if (attemptedChannels.includes(channel)) {
          continue;
        }
        
        try {
          let channelResult;
          
          switch (channel) {
            case CHANNELS.EMAIL:
              channelResult = await this.sendEmailNotification(notification, userId, userProfile);
              break;
              
            case CHANNELS.WEB:
              channelResult = await this.sendWebNotification(notification, userId, userProfile);
              break;
              
            case CHANNELS.MOBILE:
              channelResult = await this.sendMobileNotification(notification, userId, userProfile);
              break;
              
            case CHANNELS.SMS:
              channelResult = await this.sendSmsNotification(notification, userId, userProfile);
              break;
              
            case CHANNELS.API:
              channelResult = await this.sendApiNotification(notification, userId, userProfile);
              break;
              
            case CHANNELS.SLACK:
              channelResult = await this.sendSlackNotification(notification, userId, userProfile);
              break;
              
            case CHANNELS.TEAMS:
              channelResult = await this.sendTeamsNotification(notification, userId, userProfile);
              break;
              
            case CHANNELS.DISCORD:
              channelResult = await this.sendDiscordNotification(notification, userId, userProfile);
              break;
              
            case CHANNELS.WHATSAPP:
              channelResult = await this.sendWhatsAppNotification(notification, userId, userProfile);
              break;
              
            default:
              channelResult = { success: false, reason: 'unknown_channel' };
          }
          
          results.channels[channel] = channelResult;
          
          if (channelResult.success) {
            results.successfulChannels.push(channel);
          } else {
            results.failedChannels.push(channel);
          }
          
          // If a channel succeeded, stop the fallback chain
          if (channelResult.success) {
            break;
          }
          
        } catch (error) {
          logger.error(`AdvancedNotificationService: Fallback error for ${channel}: ${error.message}`);
          results.failedChannels.push(channel);
        }
      }
      
      // Update overall success status
      results.success = results.successfulChannels.length > 0;
      
      return results;
      
    } catch (error) {
      logger.error(`AdvancedNotificationService: Fallback orchestration error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Get channel fallback chain based on notification priority
   * @param {Object} notification Notification data
   * @param {Array<string>} attemptedChannels Channels already attempted
   * @returns {Array<string>} Fallback channel chain
   * @private
   */
  getChannelFallbackChain(notification, attemptedChannels) {
    const priority = notification.priority || PRIORITY.MEDIUM;
    
    // Get fallback chain for this priority level
    let fallbackChain = this.fallbackConfig.fallbackChains[priority];
    
    // If no specific chain for this priority, use medium priority chain
    if (!fallbackChain && priority !== PRIORITY.MEDIUM) {
      fallbackChain = this.fallbackConfig.fallbackChains[PRIORITY.MEDIUM];
    }
    
    // If still no chain, use default chain
    if (!fallbackChain) {
      fallbackChain = [CHANNELS.EMAIL, CHANNELS.WEB];
    }
    
    // Filter out already attempted channels
    return fallbackChain.filter(channel => !attemptedChannels.includes(channel));
  }
  
  /**
   * Assign a test variant for A/B testing
   * @param {Object} notification Notification data
   * @param {string} userId User ID
   * @returns {string|null} Assigned variant
   * @private
   */
  assignTestVariant(notification, userId) {
    if (!notification.variants || Object.keys(notification.variants).length === 0) {
      return null;
    }
    
    try {
      const variants = Object.keys(notification.variants);
      
      // Add control group if not explicitly defined
      if (!variants.includes('control') && this.abTestingConfig.controlGroupPercentage > 0) {
        variants.push('control');
      }
      
      // Use user ID for consistent variant assignment
      const hash = crypto.createHash('md5').update(userId + (notification.testId || '')).digest('hex');
      const hashValue = parseInt(hash.substring(0, 8), 16);
      const variantIndex = Math.abs(hashValue) % variants.length;
      
      const selectedVariant = variants[variantIndex];
      
      // Track variant assignment for analysis
      this.metricsCollector.recordMetric('ab_test_assignment', 1, {
        userId,
        notificationId: notification.id,
        testId: notification.testId || 'default',
        variant: selectedVariant
      });
      
      return selectedVariant;
    } catch (error) {
      logger.error(`AdvancedNotificationService: A/B test variant assignment error: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Check user consent for notification based on compliance requirements
   * @param {string} userId User ID
   * @param {Object} notification Notification data
   * @param {Object} userProfile User profile data
   * @returns {Promise<boolean>} Whether user has provided necessary consent
   * @private
   */
  async checkUserConsent(userId, notification, userProfile = null) {
    if (!this.complianceConfig.gdprEnabled && !this.complianceConfig.ccpaEnabled) {
      return true; // Compliance checking disabled
    }
    
    try {
      // Get user profile if not provided
      if (!userProfile) {
        userProfile = await this.getUserProfile(userId);
      }
      
      // If no profile found, default to allowing the notification
      if (!userProfile) {
        logger.warn(`AdvancedNotificationService: User profile not found for consent check: ${userId}`);
        return true;
      }
      
      // Check if user is in a region requiring consent
      const requiresConsent = this.userRequiresConsent(userProfile);
      
      if (!requiresConsent) {
        return true; // No consent required for this user's region
      }
      
      // For marketing intent, require explicit marketing consent
      if (notification.intent === INTENT.MARKETING) {
        return userProfile.marketingConsent === true;
      }
      
      // For all other intents, check general notification consent
      return userProfile.notificationsConsent !== false; // Default to true if undefined
      
    } catch (error) {
      logger.error(`AdvancedNotificationService: Consent check error: ${error.message}`);
      return true; // Default to allowing notification on error
    }
  }
  
  /**
   * Check if user requires consent based on region
   * @param {Object} userProfile User profile data
   * @returns {boolean} Whether user requires consent
   * @private
   */
  userRequiresConsent(userProfile) {
    // Check GDPR countries
    if (this.complianceConfig.gdprEnabled && 
        userProfile.countryCode && 
        this.complianceConfig.consentRequiredCountries.includes(userProfile.countryCode)) {
      return true;
    }
    
    // Check CCPA states
    if (this.complianceConfig.ccpaEnabled && 
        userProfile.countryCode === 'US' && 
        userProfile.stateCode && 
        this.complianceConfig.ccpaStates.includes(userProfile.stateCode)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Generate webhook signature for security
   * @param {Object} notification Notification data
   * @param {string} userId User ID
   * @returns {string} HMAC signature
   * @private
   */
  generateWebhookSignature(notification, userId) {
    const secret = process.env.WEBHOOK_SECRET || 'default-webhook-secret';
    const hmac = crypto.createHmac('sha256', secret);
    const dataToSign = JSON.stringify({
      id: notification.id,
      userId,
      timestamp: notification.timestamp
    });
    
    hmac.update(dataToSign);
    return hmac.digest('hex');
  }
  
  /**
   * Generate email content for notification
   * @param {Object} notification Notification data
   * @param {Object} userProfile User profile data
   * @returns {Promise<string>} HTML email content
   * @private
   */
  async generateEmailContent(notification, userProfile) {
    // Check if we have a template for this notification type
    let templateKey = null;
    
    // Look for a template in this order:
    // 1. League-specific template for this intent
    // 2. General template for this intent
    // 3. Default template
    
    if (notification.template) {
      templateKey = `email_${notification.template}`;
    } else if (notification.league && notification.intent) {
      templateKey = `email_${notification.league}_${notification.intent}`;
      
      if (!this.templates[templateKey]) {
        templateKey = `email_${notification.intent}`;
      }
    } else if (notification.intent) {
      templateKey = `email_${notification.intent}`;
    }
    
    // Fallback to default template if specific template not found
    if (!templateKey || !this.templates[templateKey]) {
      templateKey = 'email_default';
    }
    
    if (this.templates[templateKey]) {
      // Use template
      let content = this.templates[templateKey];
      
      // Replace common template variables
      content = this.replaceTemplateVariables(content, notification, userProfile);
      
      return content;
    }
    
    // No template available, generate basic email
    return this.generateBasicEmailContent(notification, userProfile);
  }
  
  /**
   * Replace template variables with actual values
   * @param {string} template Template content
   * @param {Object} notification Notification data
   * @param {Object} userProfile User profile data
   * @returns {string} Processed template
   * @private
   */
  replaceTemplateVariables(template, notification, userProfile) {
    let content = template;
    
    // Replace notification variables
    content = content
      .replace(/\{\{title\}\}/g, notification.title || '')
      .replace(/\{\{message\}\}/g, notification.message || '')
      .replace(/\{\{summary\}\}/g, notification.summary || notification.message || '')
      .replace(/\{\{date\}\}/g, new Date(notification.timestamp).toLocaleString())
      .replace(/\{\{priority\}\}/g, notification.priority || PRIORITY.MEDIUM)
      .replace(/\{\{intent\}\}/g, notification.intent || 'unknown')
      .replace(/\{\{id\}\}/g, notification.id)
      .replace(/\{\{league\}\}/g, this.getLeagueDisplayName(notification.league) || 'All Leagues');
    
    // Replace user variables if profile is available
    if (userProfile) {
      content = content
        .replace(/\{\{firstName\}\}/g, userProfile.firstName || 'User')
        .replace(/\{\{lastName\}\}/g, userProfile.lastName || '')
        .replace(/\{\{email\}\}/g, userProfile.email || '')
        .replace(/\{\{userId\}\}/g, userProfile.id || '');
      
      // Replace favorite team if available
      if (userProfile.favoriteTeam) {
        content = content.replace(/\{\{favoriteTeam\}\}/g, userProfile.favoriteTeam);
      }
    }
    
    // Replace notification data variables if any
    if (notification.data) {
      for (const [key, value] of Object.entries(notification.data)) {
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          content = content.replace(new RegExp(`\\{\\{data\\.${key}\\}\\}`, 'g'), value.toString());
        }
      }
    }
    
    // For grouped notifications, replace {{notifications}} with list
    if (notification.isGrouped && notification.data?.notifications) {
      let notificationsList = '';
      
      for (const n of notification.data.notifications) {
        const time = new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        notificationsList += `<li style="margin-bottom: 10px;"><strong>${time}:</strong> ${n.title}</li>`;
      }
      
      content = content.replace(/\{\{notifications\}\}/g, notificationsList);
    }
    
    return content;
  }
  
  /**
   * Generate basic email content without a template
   * @param {Object} notification Notification data
   * @param {Object} userProfile User profile data
   * @returns {string} HTML email content
   * @private
   */
  generateBasicEmailContent(notification, userProfile) {
    const priorityClass = `notification-${notification.priority || 'medium'}`;
    const username = userProfile?.firstName ? `${userProfile.firstName}` : 'User';
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${notification.title}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { padding: 20px; background-color: #003366; color: white; }
          .header h1 { margin: 0; font-size: 24px; }
          .notification { padding: 20px; border-radius: 5px; margin-bottom: 20px; }
          .notification-low { background-color: #e8f5e9; border-left: 5px solid #4caf50; }
          .notification-medium { background-color: #fff8e1; border-left: 5px solid #ffc107; }
          .notification-high { background-color: #fff5f5; border-left: 5px solid #f44336; }
          .notification-critical { background-color: #ffebee; border-left: 5px solid #d50000; color: #d50000; }
          .notification-breaking { background-color: #ffebee; border-left: 5px solid #b71c1c; color: #b71c1c; }
          .notification-personalized { background-color: #e3f2fd; border-left: 5px solid #2196f3; }
          .notification-list { list-style-type: none; padding: 0; }
          .notification-list li { padding: 10px; border-bottom: 1px solid #eee; }
          .footer { font-size: 12px; color: #777; margin-top: 30px; padding: 20px; text-align: center; background-color: #f5f5f5; }
          @media only screen and (max-width: 600px) {
            .container { width: 100%; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${notification.league ? this.getLeagueDisplayName(notification.league) : 'Sports Analytics'}</h1>
          </div>
          
          <div class="notification ${priorityClass}">
            <h2>${notification.title}</h2>
            ${notification.message ? `<p>${notification.message}</p>` : ''}
            <p><strong>Time:</strong> ${new Date(notification.timestamp).toLocaleString()}</p>
            
            ${notification.isGrouped && notification.data?.notifications ? `
              <h3>Updates:</h3>
              <ul class="notification-list">
                ${notification.data.notifications.map(n => `
                  <li>
                    <strong>${new Date(n.timestamp).toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'})}</strong>: ${n.title}
                  </li>
                `).join('')}
              </ul>
            ` : ''}
          </div>
          
          <div class="footer">
            <p>This is an automated notification from the Sports Analytics Platform.</p>
            <p>To manage your notification preferences, log in to your account and visit the Settings page.</p>
            <p>Notification ID: ${notification.id}</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
  
  /**
   * Get user profile from database
   * @param {string} userId User ID
   * @returns {Promise<Object>} User profile
   * @private
   */
  async getUserProfile(userId) {
    try {
      // In production, this would query the database
      // For demonstration, return mock profiles for testing
      const mockProfiles = {
        'user1': {
          id: 'user1',
          firstName: 'John',
          lastName: 'Smith',
          email: 'user1@example.com',
          phoneNumber: '+1234567890',
          whatsappNumber: '+1234567890',
          timezone: 'America/New_York',
          countryCode: 'US',
          stateCode: 'NY',
          notificationsConsent: true,
          marketingConsent: true,
          favoriteTeam: 'New York Yankees',
          favoritePlayers: ['Aaron Judge', 'Gerrit Cole'],
          slackChannelId: 'C0123456789',
          teamsWebhookUrl: process.env.TEAMS_WEBHOOK_URL,
          discordChannelId: '987654321',
          webhookUrl: 'https://example.com/webhooks/user1',
          channelPreferences: {
            [INTENT.GAME_START]: [CHANNELS.MOBILE, CHANNELS.WEB],
            [INTENT.GAME_END]: [CHANNELS.MOBILE, CHANNELS.WEB],
            [INTENT.SCORE_UPDATE]: [CHANNELS.MOBILE],
            [INTENT.PLAYER_PERFORMANCE]: [CHANNELS.MOBILE, CHANNELS.EMAIL],
            [LEAGUES.MLB]: [CHANNELS.MOBILE, CHANNELS.EMAIL, CHANNELS.SMS],
            [PRIORITY.CRITICAL]: [CHANNELS.MOBILE, CHANNELS.SMS, CHANNELS.EMAIL],
            'default': [CHANNELS.MOBILE, CHANNELS.WEB]
          }
        },
        'user2': {
          id: 'user2',
          firstName: 'Jane',
          lastName: 'Doe',
          email: 'user2@example.com',
          phoneNumber: '+0987654321',
          timezone: 'America/Los_Angeles',
          countryCode: 'US',
          stateCode: 'CA',
          notificationsConsent: true,
          marketingConsent: false,
          favoriteTeam: 'Los Angeles Lakers',
          favoritePlayers: ['LeBron James', 'Anthony Davis'],
          slackChannelId: 'C9876543210',
          discordChannelId: '123456789',
          webhookUrl: 'https://example.com/webhooks/user2',
          channelPreferences: {
            [INTENT.GAME_START]: [CHANNELS.MOBILE],
            [INTENT.GAME_END]: [CHANNELS.EMAIL],
            [INTENT.SCORE_UPDATE]: [CHANNELS.MOBILE, CHANNELS.WEB],
            [INTENT.PLAYER_PERFORMANCE]: [CHANNELS.MOBILE, CHANNELS.SLACK],
            [LEAGUES.NBA]: [CHANNELS.MOBILE, CHANNELS.SLACK],
            [PRIORITY.CRITICAL]: [CHANNELS.MOBILE, CHANNELS.SMS],
            'default': [CHANNELS.MOBILE]
          }
        }
      };
      
      return mockProfiles[userId] || null;
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error fetching user profile: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Get user email from database
   * @param {string} userId User ID
   * @returns {Promise<string>} User email
   * @private
   */
  async getUserEmail(userId) {
    try {
      const profile = await this.getUserProfile(userId);
      return profile?.email || null;
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error fetching user email: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Get user phone number from database
   * @param {string} userId User ID
   * @returns {Promise<string>} User phone number
   * @private
   */
  async getUserPhoneNumber(userId) {
    try {
      const profile = await this.getUserProfile(userId);
      return profile?.phoneNumber || null;
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error fetching user phone number: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Get user WhatsApp number from database
   * @param {string} userId User ID
   * @returns {Promise<string>} User WhatsApp number
   * @private
   */
  async getUserWhatsAppNumber(userId) {
    try {
      const profile = await this.getUserProfile(userId);
      return profile?.whatsappNumber || profile?.phoneNumber || null;
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error fetching user WhatsApp number: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Get user webhook URL from database
   * @param {string} userId User ID
   * @returns {Promise<string>} Webhook URL
   * @private
   */
  async getUserWebhookUrl(userId) {
    try {
      // Check the stored webhookEndpoints first
      if (this.webhookEndpoints[userId]) {
        return this.webhookEndpoints[userId];
      }
      
      // Otherwise check user profile
      const profile = await this.getUserProfile(userId);
      return profile?.webhookUrl || null;
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error fetching user webhook URL: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Get user Slack channel from database
   * @param {string} userId User ID
   * @returns {Promise<string>} Slack channel ID
   * @private
   */
  async getUserSlackChannel(userId) {
    try {
      const profile = await this.getUserProfile(userId);
      return profile?.slackChannelId || null;
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error fetching user Slack channel: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Get user Teams webhook from database
   * @param {string} userId User ID
   * @returns {Promise<string>} Teams webhook URL
   * @private
   */
  async getUserTeamsWebhook(userId) {
    try {
      const profile = await this.getUserProfile(userId);
      return profile?.teamsWebhookUrl || null;
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error fetching user Teams webhook: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Get user Discord channel from database
   * @param {string} userId User ID
   * @returns {Promise<string>} Discord channel ID
   * @private
   */
  async getUserDiscordChannel(userId) {
    try {
      const profile = await this.getUserProfile(userId);
      return profile?.discordChannelId || null;
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error fetching user Discord channel: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Get user device tokens for push notifications
   * @param {string} userId User ID
   * @returns {Promise<Array<string>>} Device tokens
   * @private
   */
  async getUserDeviceTokens(userId) {
    try {
      // In production, this would query the database
      // For testing, return mock tokens
      return [
        `device_token_${userId}_1`,
        `device_token_${userId}_2`
      ];
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error fetching device tokens: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Get user web push subscriptions
   * @param {string} userId User ID
   * @returns {Promise<Array<Object>>} Web push subscriptions
   * @private
   */
  async getUserWebPushSubscriptions(userId) {
    try {
      // In production, this would query the database
      // For testing, return mock subscriptions
      return [{
        endpoint: `https://fcm.googleapis.com/fcm/send/${userId}`,
        keys: {
          p256dh: 'mock_p256dh_key',
          auth: 'mock_auth_key'
        }
      }];
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error fetching web push subscriptions: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Remove invalid web push subscription
   * @param {string} userId User ID
   * @param {Object} subscription Subscription to remove
   * @returns {Promise<void>}
   * @private
   */
  async removeInvalidWebPushSubscription(userId, subscription) {
    try {
      // In production, this would remove from database
      logger.info(`AdvancedNotificationService: Would remove invalid web push subscription for ${userId}`);
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error removing web push subscription: ${error.message}`);
    }
  }
  
  /**
   * Remove invalid device tokens
   * @param {string} userId User ID
   * @param {Array<string>} tokens Tokens to remove
   * @returns {Promise<void>}
   * @private
   */
  async removeInvalidDeviceTokens(userId, tokens) {
    try {
      // In production, this would remove from database
      logger.info(`AdvancedNotificationService: Would remove ${tokens.length} invalid device tokens for ${userId}`);
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error removing invalid tokens: ${error.message}`);
    }
  }
  
  /**
   * Get user preferred channels for notifications
   * @param {string} userId User ID
   * @param {Object} notification Notification data
   * @returns {Promise<Array<string>>} Preferred channels
   * @private
   */
  async getUserPreferredChannels(userId, notification) {
    try {
      const userProfile = await this.getUserProfile(userId);
      return this.determineOptimalChannels(notification, userProfile);
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error getting preferred channels: ${error.message}`);
      return [CHANNELS.WEB]; // Default to web notifications
    }
  }
  
  /**
   * Get league display name
   * @param {string} leagueId League identifier
   * @returns {string} Display name
   * @private
   */
  getLeagueDisplayName(leagueId) {
    const leagueNames = {
      [LEAGUES.NBA]: 'NBA',
      [LEAGUES.NHL]: 'NHL',
      [LEAGUES.NFL]: 'NFL',
      [LEAGUES.MLB]: 'MLB',
      [LEAGUES.LA_LIGA]: 'La Liga',
      [LEAGUES.SERIE_A]: 'Serie A',
      [LEAGUES.PREMIER_LEAGUE]: 'Premier League',
      [LEAGUES.BUNDESLIGA]: 'Bundesliga'
    };
    
    return leagueNames[leagueId] || leagueId;
  }
  
  /**
   * Get logo URL for a league
   * @param {string} leagueId League identifier
   * @returns {string} Logo URL
   * @private
   */
  getLogoForLeague(leagueId) {
    const baseUrl = 'https://assets.sportsanalytics.com/leagues';
    
    const logoMap = {
      [LEAGUES.NBA]: `${baseUrl}/nba-logo.png`,
      [LEAGUES.NHL]: `${baseUrl}/nhl-logo.png`,
      [LEAGUES.NFL]: `${baseUrl}/nfl-logo.png`,
      [LEAGUES.MLB]: `${baseUrl}/mlb-logo.png`,
      [LEAGUES.LA_LIGA]: `${baseUrl}/laliga-logo.png`,
      [LEAGUES.SERIE_A]: `${baseUrl}/seriea-logo.png`,
      [LEAGUES.PREMIER_LEAGUE]: `${baseUrl}/premier-logo.png`,
      [LEAGUES.BUNDESLIGA]: `${baseUrl}/bundesliga-logo.png`
    };
    
    return logoMap[leagueId] || `${baseUrl}/generic-logo.png`;
  }
  
  /**
   * Get icon for notification
   * @param {Object} notification Notification data
   * @returns {string} Icon path
   * @private
   */
  getIconForNotification(notification) {
    if (notification.league) {
      return this.getLogoForLeague(notification.league);
    }
    
    return 'https://assets.sportsanalytics.com/icons/notification.png';
  }
  
  /**
   * Get sound for notification
   * @param {Object} notification Notification data
   * @returns {string} Sound name
   * @private
   */
  getSoundForNotification(notification) {
    if (notification.priority === PRIORITY.CRITICAL || notification.priority === PRIORITY.BREAKING) {
      return 'critical_alert.mp3';
    }
    
    if (notification.priority === PRIORITY.HIGH) {
      return 'high_alert.mp3';
    }
    
    return 'default';
  }
  
  /**
   * Get Android priority channel for notification
   * @param {Object} notification Notification data
   * @returns {string} Android channel ID
   * @private
   */
  getPriorityChannel(notification) {
    switch (notification.priority) {
      case PRIORITY.CRITICAL:
      case PRIORITY.BREAKING:
        return 'critical_alerts';
        
      case PRIORITY.HIGH:
        return 'high_priority';
        
      case PRIORITY.MEDIUM:
        return 'default';
        
      case PRIORITY.LOW:
        return 'low_priority';
        
      default:
        return 'default';
    }
  }
  
  /**
   * Track delivery attempt for rate limiting and retries
   * @param {string} notificationId Notification ID
   * @param {string} userId User ID
   * @param {Array<string>} channels Channels used
   * @private
   */
  trackDeliveryAttempt(notificationId, userId, channels) {
    const key = `${notificationId}:${userId}`;
    
    if (!this.deliveryTracking.has(key)) {
      this.deliveryTracking.set(key, {
        attempts: {},
        timestamp: Date.now()
      });
    }
    
    const tracking = this.deliveryTracking.get(key);
    
    for (const channel of channels) {
      if (!tracking.attempts[channel]) {
        tracking.attempts[channel] = 0;
      }
      
      tracking.attempts[channel]++;
    }
  }
  
  /**
   * Get delivery attempts for a notification/user/channel
   * @param {string} notificationId Notification ID
   * @param {string} userId User ID
   * @param {string} channel Channel type
   * @returns {number} Number of attempts
   * @private
   */
  getDeliveryAttempts(notificationId, userId, channel) {
    const key = `${notificationId}:${userId}`;
    
    if (!this.deliveryTracking.has(key)) {
      return 0;
    }
    
    const tracking = this.deliveryTracking.get(key);
    
    return tracking.attempts[channel] || 0;
  }
  
  /**
   * Store delivery result in Redis
   * @param {string} notificationId Notification ID
   * @param {string} userId User ID
   * @param {Object} result Delivery result
   * @returns {Promise<void>}
   * @private
   */
  async storeDeliveryResult(notificationId, userId, result) {
    if (!this.redisClient) {
      return;
    }
    
    try {
      const resultKey = `notification:result:${notificationId}`;
      
      await this.redisClient.set(
        resultKey,
        JSON.stringify(result),
        { EX: 60 * 60 * 24 * 30 } // 30 days expiry
      );
      
      // Store in user's results list
      await this.redisClient.lPush(`notification_results:${userId}`, notificationId);
      await this.redisClient.lTrim(`notification_results:${userId}`, 0, 99); // Keep last 100 results
      
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error storing delivery result: ${error.message}`);
    }
  }
  
  /**
   * Filter channels that exceed rate limits
   * @param {Array<string>} channels Requested channels
   * @param {string} userId User ID
   * @returns {Promise<Array<string>>} Allowed channels
   * @private
   */
  async filterRateLimitedChannels(channels, userId) {
    if (!this.redisClient) {
      // No Redis to track rate limits, allow all
      return channels;
    }
    
    const allowedChannels = [];
    
    for (const channel of channels) {
      // Check rate limits
      const userKey = `ratelimit:${channel}:user:${userId}`;
      const globalKey = `ratelimit:${channel}:global`;
      
      try {
        // Get current counts
        const userHourlyCount = parseInt(await this.redisClient.get(`${userKey}:hourly`) || '0');
        const userDailyCount = parseInt(await this.redisClient.get(`${userKey}:daily`) || '0');
        const globalHourlyCount = parseInt(await this.redisClient.get(`${globalKey}:hourly`) || '0');
        
        // Get limits
        const userHourlyLimit = this.rateLimits[channel]?.perHour || 20;
        const userDailyLimit = this.rateLimits[channel]?.perDay || 50;
        const globalHourlyLimit = this.rateLimits[channel]?.perHour * 10 || 500; // Global limit is higher
        
        // Check if user is rate limited
        if (userHourlyCount >= userHourlyLimit) {
          logger.warn(`AdvancedNotificationService: User ${userId} hourly rate limited for ${channel} channel`);
          continue;
        }
        
        if (userDailyCount >= userDailyLimit) {
          logger.warn(`AdvancedNotificationService: User ${userId} daily rate limited for ${channel} channel`);
          continue;
        }
        
        // Check global rate limit
        if (globalHourlyCount >= globalHourlyLimit) {
          logger.warn(`AdvancedNotificationService: Global rate limit reached for ${channel} channel`);
          continue;
        }
        
        // Increment counters
        await this.redisClient.incr(`${userKey}:hourly`);
        await this.redisClient.expire(`${userKey}:hourly`, 3600); // 1 hour
        
        await this.redisClient.incr(`${userKey}:daily`);
        await this.redisClient.expire(`${userKey}:daily`, 86400); // 24 hours
        
        await this.redisClient.incr(`${globalKey}:hourly`);
        await this.redisClient.expire(`${globalKey}:hourly`, 3600); // 1 hour
        
        // Channel is allowed
        allowedChannels.push(channel);
        
      } catch (error) {
        logger.error(`AdvancedNotificationService: Rate limit check error: ${error.message}`);
        // Allow channel on error
        allowedChannels.push(channel);
      }
    }
    
    return allowedChannels;
  }
  
  /**
   * Retry sending a notification
   * @param {Object} notification Notification data
   * @param {string} userId User ID
   * @param {Array<string>} channels Channels to retry
   * @param {Object} userProfile User profile data
   * @returns {Promise<Object>} Retry result
   * @private
   */
  async retryNotification(notification, userId, channels, userProfile = null) {
    logger.info(`AdvancedNotificationService: Retrying ${channels.join(', ')} notification ${notification.id} for user ${userId}`);
    
    // Get user profile if not provided
    if (!userProfile) {
      userProfile = await this.getUserProfile(userId);
    }
    
    return this.processNotificationDelivery(notification, userId, channels, userProfile);
  }
  
  /**
   * Get notification delivery status
   * @param {string} notificationId Notification ID
   * @returns {Promise<Object>} Delivery status
   */
  async getDeliveryStatus(notificationId) {
    if (!this.redisClient) {
      return null;
    }
    
    try {
      const resultKey = `notification:result:${notificationId}`;
      const resultJson = await this.redisClient.get(resultKey);
      
      if (!resultJson) {
        return null;
      }
      
      return JSON.parse(resultJson);
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error getting delivery status: ${error.message}`);
      return null;
    }
  }
  
  /**
   * Group notifications by intent
   * @param {Array<Object>} notifications Notifications to group
   * @returns {Array<Object>} Grouped notifications
   */
  groupNotificationsByIntent(notifications) {
    if (!notifications || notifications.length <= 1) {
      return notifications;
    }
    
    try {
      // Sort by intent and timestamp
      notifications.sort((a, b) => {
        if (a.intent === b.intent) {
          return new Date(a.timestamp) - new Date(b.timestamp);
        }
        return a.intent.localeCompare(b.intent);
      });
      
      const groups = [];
      let currentGroup = null;
      
      for (const notification of notifications) {
        if (!currentGroup || currentGroup.intent !== notification.intent) {
          // Start a new group
          if (currentGroup) {
            groups.push(currentGroup);
          }
          
          currentGroup = {
            id: crypto.randomUUID(),
            intent: notification.intent,
            title: this.getGroupTitleForIntent(notification.intent, 1),
            timestamp: notification.timestamp,
            isGrouped: true,
            groupSize: 1,
            notifications: [notification]
          };
        } else {
          // Add to current group
          currentGroup.groupSize++;
          currentGroup.notifications.push(notification);
          currentGroup.title = this.getGroupTitleForIntent(notification.intent, currentGroup.groupSize);
          
          // Use the latest timestamp
          if (new Date(notification.timestamp) > new Date(currentGroup.timestamp)) {
            currentGroup.timestamp = notification.timestamp;
          }
        }
      }
      
      // Add the last group
      if (currentGroup) {
        groups.push(currentGroup);
      }
      
      return groups;
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error grouping notifications: ${error.message}`);
      return notifications;
    }
  }
  
  /**
   * Get title for a notification group
   * @param {string} intent Intent identifier
   * @param {number} count Number of notifications
   * @returns {string} Group title
   * @private
   */
  getGroupTitleForIntent(intent, count) {
    switch (intent) {
      case INTENT.SCORE_UPDATE:
        return `${count} Score Updates`;
        
      case INTENT.PLAYER_PERFORMANCE:
        return `${count} Player Highlights`;
        
      case INTENT.GAME_START:
        return `${count} Games Starting Soon`;
        
      case INTENT.GAME_END:
        return `${count} Game Results`;
        
      case INTENT.INJURY_UPDATE:
        return `${count} Injury Updates`;
        
      case INTENT.TEAM_NEWS:
        return `${count} Team Updates`;
        
      case INTENT.TRANSFER_NEWS:
        return `${count} Transfer Updates`;
        
      case INTENT.BETTING_ODDS:
        return `${count} Odds Updates`;
        
      case INTENT.FANTASY_ALERT:
        return `${count} Fantasy Alerts`;
        
      default:
        return `${count} ${this.capitalizeFirst(intent.replace('_', ' '))} Updates`;
    }
  }
  
  /**
   * Capitalize first letter of a string
   * @param {string} str String to capitalize
   * @returns {string} Capitalized string
   * @private
   */
  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
  
  /**
   * Scan Redis for keys matching a pattern
   * @param {string} pattern Key pattern
   * @returns {Promise<Array<string>>} Matching keys
   * @private
   */
  async scanRedisKeys(pattern) {
    if (!this.redisClient) {
      return [];
    }
    
    try {
      const keys = [];
      let cursor = 0;
      
      do {
        const result = await this.redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = result.cursor;
        keys.push(...result.keys);
      } while (cursor !== 0);
      
      return keys;
    } catch (error) {
      logger.error(`AdvancedNotificationService: Redis scan error: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Clean up expired data
   * @returns {Promise<void>}
   * @private
   */
  async cleanupExpiredData() {
    if (!this.redisClient) {
      return;
    }
    
    try {
      logger.info('AdvancedNotificationService: Running expired data cleanup');
      
      // Calculate expiry threshold (30 days ago)
      const expiryThreshold = Date.now() - (this.complianceConfig.dataRetentionPeriod * 86400000);
      
      // Get all notification results
      const resultKeys = await this.scanRedisKeys('notification:result:*');
      
      for (const key of resultKeys) {
        try {
          const resultJson = await this.redisClient.get(key);
          
          if (resultJson) {
            const result = JSON.parse(resultJson);
            
            // Check if older than threshold
            if (new Date(result.timestamp) < new Date(expiryThreshold)) {
              await this.redisClient.del(key);
              logger.debug(`AdvancedNotificationService: Deleted expired result: ${key}`);
            }
          }
        } catch (err) {
          logger.error(`AdvancedNotificationService: Error processing expired key ${key}: ${err.message}`);
        }
      }
      
      // Also clean up in-memory tracking for old items
      const trackingKeys = [...this.deliveryTracking.keys()];
      
      for (const key of trackingKeys) {
        const tracking = this.deliveryTracking.get(key);
        
        if (tracking.timestamp < expiryThreshold) {
          this.deliveryTracking.delete(key);
        }
      }
      
      logger.info('AdvancedNotificationService: Completed expired data cleanup');
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error during data cleanup: ${error.message}`);
    }
  }
  
  /**
   * Clean up resources before shutdown
   * @returns {Promise<void>}
   */
  async shutdown() {
    logger.info('AdvancedNotificationService: Shutting down notification service');
    
    // Close email transport
    if (this.emailTransport) {
      this.emailTransport.close();
    }
    
    // Shutdown ML service
    if (this.mlService) {
      await this.mlService.shutdown();
    }
    
    // Flush metrics
    if (this.metricsCollector) {
      await this.metricsCollector.flush();
    }
    
    // Clear in-memory tracking
    this.deliveryTracking.clear();
    
    logger.info('AdvancedNotificationService: Notification service shutdown complete');
  }
}

module.exports = {
  AdvancedNotificationService,
  CHANNELS,
  PRIORITY,
  INTENT,
  LEAGUES,
  SENTIMENT
}; = require('@tensorflow-models/sentiment');
const { NlpManager } = require('node-nlp');
const { MachineLearningService } = require('./ml_service');
const { DataAnalyticsService } = require('./analytics_service');
const { ComplianceService } = require('./compliance_service');
const { PrivacyManager } = require('./privacy_manager');
const { MetricsCollector } = require('./metrics_collector');
const firebaseAdmin = require('firebase-admin');
const twilio = require('twilio');
const { WebClient } = require('@slack/web-api');
const { WebPushManager } = require('./web_push_manager');
const { WhatsAppClient } = require('./whatsapp_client');
const { TeamsClient } = require('./teams_client');
const { DiscordClient } = require('./discord_client');

// Sports data integration
const { SportsDataClient } = require('./sports_data_client');

/**
 * Notification channel types
 * @type {Object}
 */
const CHANNELS = {
  WEB: 'web',
  MOBILE: 'mobile',
  EMAIL: 'email',
  SMS: 'sms',
  API: 'api',
  SLACK: 'slack',
  TEAMS: 'teams',
  DISCORD: 'discord',
  WHATSAPP: 'whatsapp'
};

/**
 * Notification priority levels
 * @type {Object}
 */
const PRIORITY = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical',
  BREAKING: 'breaking',
  PERSONALIZED: 'personalized'
};

/**
 * Notification intents/categories
 * @type {Object}
 */
const INTENT = {
  GAME_START: 'game_start',
  GAME_END: 'game_end',
  SCORE_UPDATE: 'score_update',
  PLAYER_PERFORMANCE: 'player_performance',
  TEAM_NEWS: 'team_news',
  INJURY_UPDATE: 'injury_update',
  TRANSFER_NEWS: 'transfer_news',
  BETTING_ODDS: 'betting_odds',
  FANTASY_ALERT: 'fantasy_alert',
  LEAGUE_NEWS: 'league_news',
  SUBSCRIPTION: 'subscription',
  ACCOUNT: 'account',
  MARKETING: 'marketing',
  TECHNICAL: 'technical'
};

/**
 * League identifiers
 * @type {Object}
 */
const LEAGUES = {
  NBA: 'nba',
  NHL: 'nhl',
  NFL: 'nfl',
  MLB: 'mlb',
  LA_LIGA: 'la_liga',
  SERIE_A: 'serie_a',
  PREMIER_LEAGUE: 'premier_league',
  BUNDESLIGA: 'bundesliga'
};

/**
 * Sentiment categories
 * @type {Object}
 */
const SENTIMENT = {
  VERY_NEGATIVE: 'very_negative',
  NEGATIVE: 'negative',
  NEUTRAL: 'neutral',
  POSITIVE: 'positive',
  VERY_POSITIVE: 'very_positive'
};

/**
 * Advanced Notification Service with ML-powered optimizations
 */
class AdvancedNotificationService {
  /**
   * Initialize the notification service
   * @param {Object} options Configuration options
   */
  constructor(options = {}) {
    // Core connections
    this.redisClient = options.redisClient || null;
    this.emailTransport = null;
    this.webhookEndpoints = options.webhookEndpoints || {};
    this.templatesDir = options.templatesDir || path.join(__dirname, '../../templates');
    
    // Default configuration
    this.defaultSender = options.defaultSender || 'Sports Analytics <noreply@sportsanalytics.com>';
    this.templates = {};
    this.deliveryTracking = new Map();
    this.enabled = options.enabled !== false;
    this.timeZoneDefault = options.timeZoneDefault || 'America/New_York';
    
    // Initialize service configurations
    this.initializeConfigurations(options);
    
    // Service clients
    this.initializeServiceClients(options);
    
    // ML models and advanced features
    this.initializeModels();
    
    // Bind methods
    this.bindMethods();
  }
  
  /**
   * Initialize configurations for various services
   * @param {Object} options Configuration options
   * @private
   */
  initializeConfigurations(options) {
    // Rate limiting settings with league-specific adjustments
    this.rateLimits = options.rateLimits || this.getDefaultRateLimits();
    
    // Retry configuration
    this.retryConfig = options.retryConfig || {
      maxRetries: 5,
      retryDelay: 1000,
      retryBackoff: 2,
      maxRetryDelay: 60000
    };
    
    // ML-based delivery optimization settings
    this.mlConfig = options.mlConfig || {
      enabled: true,
      userEngagementWeight: 0.7,
      contextWeight: 0.3,
      minimumDataPoints: 5,
      retrainingInterval: 86400000, // 24 hours
      timeSlotGranularity: 30 // 30 minute intervals
    };
    
    // Multivariate testing config
    this.abTestingConfig = options.abTestingConfig || {
      enabled: true,
      defaultTestSplit: 0.5, // 50/50 split by default
      minSampleSize: 100,
      significanceLevel: 0.05,
      controlGroupPercentage: 0.1
    };
    
    // Intent-based grouping settings
    this.groupingConfig = options.groupingConfig || {
      enabled: true,
      maxGroupSize: 5,
      groupingTimeWindow: 1800000, // 30 minutes
      intentSimilarityThreshold: 0.75
    };
    
    // Progressive delivery settings
    this.progressiveDeliveryConfig = options.progressiveDeliveryConfig || {
      enabled: true,
      summaryMaxLength: 140,
      detailsExpiryTime: 86400000 // 24 hours
    };
    
    // Compliance settings
    this.complianceConfig = options.complianceConfig || {
      gdprEnabled: true,
      ccpaEnabled: true,
      piiDetectionEnabled: true,
      dataRetentionPeriod: 30, // days
      consentRequiredCountries: [
        'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 
        'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 
        'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB'
      ],
      ccpaStates: ['CA', 'VA', 'CO', 'CT', 'UT']
    };
    
    // Channel fallback settings
    this.fallbackConfig = options.fallbackConfig || {
      enabled: true,
      fallbackChains: {
        [PRIORITY.CRITICAL]: [CHANNELS.MOBILE, CHANNELS.SMS, CHANNELS.EMAIL, CHANNELS.SLACK],
        [PRIORITY.HIGH]: [CHANNELS.MOBILE, CHANNELS.EMAIL, CHANNELS.WEB],
        [PRIORITY.MEDIUM]: [CHANNELS.EMAIL, CHANNELS.WEB],
        [PRIORITY.LOW]: [CHANNELS.WEB]
      },
      waitTimeBetweenFallbacks: 300000 // 5 minutes
    };
    
    // Sentiment analysis settings
    this.sentimentConfig = options.sentimentConfig || {
      enabled: true,
      adjustTone: true,
      sentimentThresholds: {
        [SENTIMENT.VERY_NEGATIVE]: -0.75,
        [SENTIMENT.NEGATIVE]: -0.25,
        [SENTIMENT.NEUTRAL]: 0.25,
        [SENTIMENT.POSITIVE]: 0.75
      }
    };
    
    // League-specific settings
    this.leagueConfig = options.leagueConfig || this.getDefaultLeagueConfig();
  }
  
  /**
   * Initialize service clients for various notification channels
   * @param {Object} options Configuration options
   * @private
   */
  initializeServiceClients(options) {
    // Initialize SMS provider (Twilio)
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      this.twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    } else {
      this.twilioClient = null;
    }
    
    // Initialize Firebase Admin for push notifications
    if (process.env.FIREBASE_CREDENTIALS) {
      try {
        const firebaseCredentials = JSON.parse(process.env.FIREBASE_CREDENTIALS);
        firebaseAdmin.initializeApp({
          credential: firebaseAdmin.credential.cert(firebaseCredentials)
        });
        this.firebaseMessaging = firebaseAdmin.messaging();
      } catch (error) {
        logger.error(`NotificationService: Firebase initialization error: ${error.message}`);
        this.firebaseMessaging = null;
      }
    } else {
      this.firebaseMessaging = null;
    }
    
    // Initialize Slack client
    if (process.env.SLACK_BOT_TOKEN) {
      this.slackClient = new WebClient(process.env.SLACK_BOT_TOKEN);
    } else {
      this.slackClient = null;
    }
    
    // Initialize Teams client
    if (process.env.TEAMS_WEBHOOK_URL) {
      this.teamsClient = new TeamsClient({
        webhookUrl: process.env.TEAMS_WEBHOOK_URL
      });
    } else {
      this.teamsClient = null;
    }
    
    // Initialize Discord client
    if (process.env.DISCORD_BOT_TOKEN) {
      this.discordClient = new DiscordClient({
        token: process.env.DISCORD_BOT_TOKEN
      });
    } else {
      this.discordClient = null;
    }
    
    // Initialize WhatsApp Business API client
    if (process.env.WHATSAPP_API_KEY && process.env.WHATSAPP_PHONE_ID) {
      this.whatsappClient = new WhatsAppClient({
        apiKey: process.env.WHATSAPP_API_KEY,
        phoneNumberId: process.env.WHATSAPP_PHONE_ID,
        businessAccountId: process.env.WHATSAPP_BUSINESS_ID
      });
    } else {
      this.whatsappClient = null;
    }
    
    // Initialize Web Push Manager
    if (process.env.WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY) {
      this.webPushManager = new WebPushManager({
        publicKey: process.env.WEB_PUSH_PUBLIC_KEY,
        privateKey: process.env.WEB_PUSH_PRIVATE_KEY,
        subject: 'mailto:webpush@sportsanalytics.com'
      });
    } else {
      this.webPushManager = null;
    }
    
    // Initialize Sports Data Client
    this.sportsDataClient = new SportsDataClient({
      apiKeys: {
        [LEAGUES.NBA]: process.env.NBA_API_KEY,
        [LEAGUES.NHL]: process.env.NHL_API_KEY,
        [LEAGUES.NFL]: process.env.NFL_API_KEY,
        [LEAGUES.MLB]: process.env.MLB_API_KEY,
        [LEAGUES.LA_LIGA]: process.env.LA_LIGA_API_KEY,
        [LEAGUES.SERIE_A]: process.env.SERIE_A_API_KEY,
        [LEAGUES.PREMIER_LEAGUE]: process.env.PREMIER_LEAGUE_API_KEY,
        [LEAGUES.BUNDESLIGA]: process.env.BUNDESLIGA_API_KEY
      }
    });
    
    // Initialize ML and analytics services
    this.mlService = new MachineLearningService({
      redisClient: this.redisClient,
      config: this.mlConfig
    });
    
    this.analyticsService = new DataAnalyticsService({
      redisClient: this.redisClient
    });
    
    // Initialize compliance service
    this.complianceService = new ComplianceService({
      config: this.complianceConfig
    });
    
    // Initialize privacy manager
    this.privacyManager = new PrivacyManager({
      complianceConfig: this.complianceConfig,
      redisClient: this.redisClient
    });
    
    // Initialize metrics collector
    this.metricsCollector = new MetricsCollector({
      redisClient: this.redisClient,
      serviceId: 'notification_service',
      flushInterval: 60000 // 1 minute
    });
  }
  
  /**
   * Initialize ML models for advanced features
   * @private
   */
  async initializeModels() {
    // Initialize sentiment analyzer
    this.sentimentAnalyzer = new SentimentAnalyzer({
      modelPath: path.join(__dirname, '../../models/sentiment')
    });
    await this.sentimentAnalyzer.load();
    
    // Initialize NLP manager for intent classification
    this.nlpManager = new NlpManager({ languages: ['en'] });
    await this.loadIntentModel();
  }
  
  /**
   * Bind class methods
   * @private
   */
  bindMethods() {
    this.initialize = this.initialize.bind(this);
    this.sendNotification = this.sendNotification.bind(this);
    this.sendScheduledNotification = this.sendScheduledNotification.bind(this);
    this.sendBatchNotifications = this.sendBatchNotifications.bind(this);
    this.getOptimalDeliveryTime = this.getOptimalDeliveryTime.bind(this);
    this.analyzeNotificationSentiment = this.analyzeNotificationSentiment.bind(this);
    this.groupNotificationsByIntent = this.groupNotificationsByIntent.bind(this);
    this.checkUserConsent = this.checkUserConsent.bind(this);
    this.getChannelFallbackChain = this.getChannelFallbackChain.bind(this);
    this.shutdown = this.shutdown.bind(this);
  }
  
  /**
   * Get default rate limits for channels
   * @returns {Object} Default rate limits
   * @private
   */
  getDefaultRateLimits() {
    return {
      [CHANNELS.EMAIL]: { perUser: 10, perHour: 50, perDay: 100 },
      [CHANNELS.SMS]: { perUser: 5, perHour: 20, perDay: 50 },
      [CHANNELS.WEB]: { perUser: 30, perHour: 150, perDay: 500 },
      [CHANNELS.MOBILE]: { perUser: 20, perHour: 100, perDay: 300 },
      [CHANNELS.API]: { perUser: 50, perHour: 300, perDay: 1000 },
      [CHANNELS.SLACK]: { perUser: 20, perHour: 100, perDay: 300 },
      [CHANNELS.TEAMS]: { perUser: 20, perHour: 100, perDay: 300 },
      [CHANNELS.DISCORD]: { perUser: 30, perHour: 150, perDay: 500 },
      [CHANNELS.WHATSAPP]: { perUser: 10, perHour: 50, perDay: 100 }
    };
  }
  
  /**
   * Get default league-specific configuration
   * @returns {Object} League configuration
   * @private
   */
  getDefaultLeagueConfig() {
    return {
      [LEAGUES.NBA]: {
        gameStartBuffer: 15, // minutes before game to send notification
        gameEndBuffer: 10, // minutes after game to send summary
        scoreUpdateThreshold: 5, // points
        playerPerformanceThreshold: 25, // points
        defaultChannels: [CHANNELS.MOBILE, CHANNELS.WEB]
      },
      [LEAGUES.NHL]: {
        gameStartBuffer: 15,
        gameEndBuffer: 10,
        scoreUpdateThreshold: 1, // goals
        playerPerformanceThreshold: 2, // goals/assists
        defaultChannels: [CHANNELS.MOBILE, CHANNELS.WEB]
      },
      [LEAGUES.NFL]: {
        gameStartBuffer: 30,
        gameEndBuffer: 15,
        scoreUpdateThreshold: 7, // points
        playerPerformanceThreshold: 100, // yards or 1 TD
        defaultChannels: [CHANNELS.MOBILE, CHANNELS.WEB]
      },
      [LEAGUES.MLB]: {
        gameStartBuffer: 15,
        gameEndBuffer: 10,
        scoreUpdateThreshold: 3, // runs
        playerPerformanceThreshold: 3, // hits, RBIs, etc
        defaultChannels: [CHANNELS.MOBILE, CHANNELS.WEB]
      },
      [LEAGUES.LA_LIGA]: {
        gameStartBuffer: 20,
        gameEndBuffer: 10,
        scoreUpdateThreshold: 1, // goals
        playerPerformanceThreshold: 1, // goals/assists
        defaultChannels: [CHANNELS.MOBILE, CHANNELS.WEB]
      },
      [LEAGUES.SERIE_A]: {
        gameStartBuffer: 20,
        gameEndBuffer: 10,
        scoreUpdateThreshold: 1, // goals
        playerPerformanceThreshold: 1, // goals/assists
        defaultChannels: [CHANNELS.MOBILE, CHANNELS.WEB]
      },
      [LEAGUES.PREMIER_LEAGUE]: {
        gameStartBuffer: 20,
        gameEndBuffer: 10,
        scoreUpdateThreshold: 1, // goals
        playerPerformanceThreshold: 1, // goals/assists
        defaultChannels: [CHANNELS.MOBILE, CHANNELS.WEB]
      },
      [LEAGUES.BUNDESLIGA]: {
        gameStartBuffer: 20,
        gameEndBuffer: 10,
        scoreUpdateThreshold: 1, // goals
        playerPerformanceThreshold: 1, // goals/assists
        defaultChannels: [CHANNELS.MOBILE, CHANNELS.WEB]
      }
    };
  }
  
  /**
   * Initialize the notification service
   * @returns {Promise<void>}
   */
  async initialize() {
    logger.info('AdvancedNotificationService: Initializing notification service');
    
    try {
      // Initialize email transport if configured
      if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        this.emailTransport = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: process.env.SMTP_PORT || 587,
          secure: process.env.SMTP_SECURE === 'true',
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
          },
          pool: true,
          maxConnections: 10,
          rateDelta: 1000,
          rateLimit: 5
        });
        
        // Verify connection
        await this.emailTransport.verify();
        logger.info('AdvancedNotificationService: Email transport initialized successfully');
      } else {
        logger.warn('AdvancedNotificationService: Email transport not configured');
      }
      
      // Load notification templates
      await this.loadTemplates();
      
      // Initialize ML models and analysis modules
      await this.sentimentAnalyzer.initialize();
      
      // Start ML model training if data is available
      if (this.mlConfig.enabled) {
        try {
          await this.mlService.trainDeliveryTimeModel();
          
          // Schedule periodic retraining
          setInterval(() => {
            this.mlService.trainDeliveryTimeModel()
              .catch(err => logger.error(`ML model retraining error: ${err.message}`));
          }, this.mlConfig.retrainingInterval);
          
          logger.info('AdvancedNotificationService: ML delivery optimization model initialized');
        } catch (error) {
          logger.warn(`AdvancedNotificationService: ML model initialization warning: ${error.message}`);
        }
      }
      
      // Start cleaning up expired data periodically
      setInterval(() => {
        this.cleanupExpiredData()
          .catch(err => logger.error(`Data cleanup error: ${err.message}`));
      }, 86400000); // Daily cleanup
      
      // Start processing notification groups periodically
      if (this.groupingConfig.enabled) {
        setInterval(() => {
          this.processNotificationGroups()
            .catch(err => logger.error(`Group processing error: ${err.message}`));
        }, 300000); // Every 5 minutes
      }
      
      logger.info('AdvancedNotificationService: Service initialized successfully');
      
    } catch (error) {
      logger.error(`AdvancedNotificationService: Initialization error: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Load notification templates for different channels
   * @returns {Promise<void>}
   * @private
   */
  async loadTemplates() {
    try {
      // Check if templates directory exists
      try {
        await fs.access(this.templatesDir);
      } catch (err) {
        logger.warn(`AdvancedNotificationService: Templates directory not found: ${this.templatesDir}`);
        return;
      }
      
      // Load templates for each channel type
      const channelDirs = ['email', 'sms', 'push', 'web', 'slack', 'teams', 'discord', 'whatsapp'];
      let totalTemplates = 0;
      
      for (const channelDir of channelDirs) {
        const channelPath = path.join(this.templatesDir, channelDir);
        
        try {
          await fs.access(channelPath);
          const files = await fs.readdir(channelPath);
          
          for (const file of files) {
            if (file.endsWith('.html') || file.endsWith('.txt') || file.endsWith('.json')) {
              const templateName = file.replace(/\.(html|txt|json)$/, '');
              const templateContent = await fs.readFile(path.join(channelPath, file), 'utf8');
              
              this.templates[`${channelDir}_${templateName}`] = templateContent;
              totalTemplates++;
            }
          }
        } catch (err) {
          logger.debug(`AdvancedNotificationService: No ${channelDir} templates found: ${err.message}`);
        }
      }
      
      // Load league-specific templates
      for (const league of Object.values(LEAGUES)) {
        const leaguePath = path.join(this.templatesDir, league);
        
        try {
          await fs.access(leaguePath);
          const files = await fs.readdir(leaguePath);
          
          for (const file of files) {
            if (file.endsWith('.html') || file.endsWith('.txt') || file.endsWith('.json')) {
              const templateName = file.replace(/\.(html|txt|json)$/, '');
              const templateContent = await fs.readFile(path.join(leaguePath, file), 'utf8');
              
              this.templates[`${league}_${templateName}`] = templateContent;
              totalTemplates++;
            }
          }
        } catch (err) {
          logger.debug(`AdvancedNotificationService: No ${league} templates found: ${err.message}`);
        }
      }
      
      logger.info(`AdvancedNotificationService: Loaded ${totalTemplates} templates`);
      
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error loading templates: ${error.message}`);
    }
  }
  
  /**
   * Load pre-trained intent classification model
   * @returns {Promise<void>}
   * @private
   */
  async loadIntentModel() {
    try {
      const modelPath = path.join(__dirname, '../../models/intent/model.nlp');
      
      try {
        await fs.access(modelPath);
        await this.nlpManager.load(modelPath);
        logger.info('AdvancedNotificationService: Intent classification model loaded');
      } catch (err) {
        // If model doesn't exist, train a basic model with intent examples
        logger.warn('AdvancedNotificationService: Intent model not found, training basic model');
        
        // Add example utterances for each intent
        this.nlpManager.addDocument('en', 'Game starts soon', INTENT.GAME_START);
        this.nlpManager.addDocument('en', 'Match beginning in 15 minutes', INTENT.GAME_START);
        this.nlpManager.addDocument('en', 'Game finished', INTENT.GAME_END);
        this.nlpManager.addDocument('en', 'Match completed with a final score', INTENT.GAME_END);
        this.nlpManager.addDocument('en', 'Score update', INTENT.SCORE_UPDATE);
        this.nlpManager.addDocument('en', 'New goal scored', INTENT.SCORE_UPDATE);
        this.nlpManager.addDocument('en', 'Player scored 30 points', INTENT.PLAYER_PERFORMANCE);
        this.nlpManager.addDocument('en', 'MVP performance by player', INTENT.PLAYER_PERFORMANCE);
        this.nlpManager.addDocument('en', 'Team news update', INTENT.TEAM_NEWS);
        this.nlpManager.addDocument('en', 'Coach interview after game', INTENT.TEAM_NEWS);
        this.nlpManager.addDocument('en', 'Player injured during practice', INTENT.INJURY_UPDATE);
        this.nlpManager.addDocument('en', 'Expected to miss next game due to injury', INTENT.INJURY_UPDATE);
        this.nlpManager.addDocument('en', 'Player transferred to new team', INTENT.TRANSFER_NEWS);
        this.nlpManager.addDocument('en', 'New signing announced', INTENT.TRANSFER_NEWS);
        this.nlpManager.addDocument('en', 'Odds have changed for upcoming game', INTENT.BETTING_ODDS);
        this.nlpManager.addDocument('en', 'New betting lines available', INTENT.BETTING_ODDS);
        this.nlpManager.addDocument('en', 'Player projections for fantasy', INTENT.FANTASY_ALERT);
        this.nlpManager.addDocument('en', 'Fantasy points update', INTENT.FANTASY_ALERT);
        this.nlpManager.addDocument('en', 'League announces new rules', INTENT.LEAGUE_NEWS);
        this.nlpManager.addDocument('en', 'Season schedule released', INTENT.LEAGUE_NEWS);
        this.nlpManager.addDocument('en', 'Your subscription has been renewed', INTENT.SUBSCRIPTION);
        this.nlpManager.addDocument('en', 'Subscription expiring soon', INTENT.SUBSCRIPTION);
        this.nlpManager.addDocument('en', 'Account security alert', INTENT.ACCOUNT);
        this.nlpManager.addDocument('en', 'Password has been changed', INTENT.ACCOUNT);
        this.nlpManager.addDocument('en', 'Special offer for subscribers', INTENT.MARKETING);
        this.nlpManager.addDocument('en', 'New premium features available', INTENT.MARKETING);
        this.nlpManager.addDocument('en', 'System maintenance scheduled', INTENT.TECHNICAL);
        this.nlpManager.addDocument('en', 'App update available', INTENT.TECHNICAL);
        
        // Train the model
        await this.nlpManager.train();
        
        // Save the model for future use
        await this.nlpManager.save(modelPath);
        logger.info('AdvancedNotificationService: Basic intent model trained and saved');
      }
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error loading intent model: ${error.message}`);
    }
  }
  
  /**
   * Set Redis client
   * @param {Object} client Redis client
   */
  setRedisClient(client) {
    this.redisClient = client;
    this.mlService.setRedisClient(client);
    this.analyticsService.setRedisClient(client);
    this.privacyManager.setRedisClient(client);
    this.metricsCollector.setRedisClient(client);
  }
  
  /**
   * Send a notification via specified channels with advanced features
   * @param {Object} notification Notification data
   * @param {string} userId User ID to notify
   * @param {Array<string>} channels Channels to use for delivery
   * @param {Object} options Additional options
   * @returns {Promise<Object>} Delivery results
   */
  async sendNotification(notification, userId, channels = null, options = {}) {
    const startTime = Date.now();
    
    if (!this.enabled) {
      logger.warn('AdvancedNotificationService: Notification service is disabled');
      return { success: false, reason: 'service_disabled' };
    }
    
    // Validate notification
    if (!notification || !notification.title) {
      logger.error('AdvancedNotificationService: Invalid notification');
      return { success: false, reason: 'invalid_notification' };
    }
    
    // Validate userId
    if (!userId) {
      logger.error('AdvancedNotificationService: Missing userId');
      return { success: false, reason: 'missing_user_id' };
    }
    
    try {
      // Get user metadata and preferences
      const userProfile = await this.getUserProfile(userId);
      
      // Check for user consent based on region and compliance requirements
      if (!await this.checkUserConsent(userId, notification, userProfile)) {
        logger.info(`AdvancedNotificationService: User ${userId} has not provided required consent for this notification type`);
        return { success: false, reason: 'consent_not_provided' };
      }
      
      // Generate unique notification ID if not provided
      if (!notification.id) {
        notification.id = crypto.randomUUID();
      }
      
      // Set default timestamp if not provided
      if (!notification.timestamp) {
        notification.timestamp = new Date();
      }
      
      // Set default intent if not provided
      if (!notification.intent) {
        // Use NLP to determine intent from title and message
        const intentResult = await this.classifyNotificationIntent(notification);
        notification.intent = intentResult.intent;
        notification.intentConfidence = intentResult.confidence;
      }
      
      // Set default league if not provided but sport team/player is mentioned
      if (!notification.league && notification.data && (notification.data.teamId || notification.data.playerId)) {
        notification.league = await this.detectLeagueFromEntityId(
          notification.data.teamId || notification.data.playerId,
          notification.data.teamId ? 'team' : 'player'
        );
      }
      
      // If testing variant is specified, assign that variant
      let variant = options.testVariant || null;
      
      // If A/B testing is enabled and no variant is specified, randomly assign one
      if (this.abTestingConfig.enabled && notification.variants && !variant) {
        variant = this.assignTestVariant(notification, userId);
        
        // Apply the selected variant's content
        if (variant && notification.variants[variant]) {
          const variantData = notification.variants[variant];
          for (const [key, value] of Object.entries(variantData)) {
            notification[key] = value;
          }
          notification.assignedVariant = variant;
        }
      }
      
      // Apply sentiment analysis and adjust tone if enabled
      if (this.sentimentConfig.enabled) {
        await this.analyzeNotificationSentiment(notification);
      }
      
      // Determine appropriate channels if not specified
      if (!channels || channels.length === 0) {
        channels = this.determineOptimalChannels(notification, userProfile);
      }
      
      // If immediate delivery is requested, send now
      if (options.immediate === true) {
        return await this.processNotificationDelivery(notification, userId, channels, userProfile);
      }
      
      // Check if notification should be grouped with others of same intent
      if (this.groupingConfig.enabled && !options.bypassGrouping) {
        const wasGrouped = await this.addToNotificationGroup(notification, userId, channels);
        
        if (wasGrouped) {
          logger.debug(`AdvancedNotificationService: Notification ${notification.id} added to group for user ${userId}`);
          return { 
            success: true, 
            grouped: true, 
            notificationId: notification.id,
            willBeDelivered: true,
            estimatedDelivery: new Date(Date.now() + this.groupingConfig.groupingTimeWindow)
          };
        }
      }
      
      // If not grouped, determine optimal delivery time
      if (this.mlConfig.enabled && !options.immediate && !options.scheduledTime) {
        const optimalTime = await this.getOptimalDeliveryTime(notification, userId, userProfile);
        
        // If optimal time is in the future, schedule the notification
        if (optimalTime > Date.now()) {
          await this.scheduleNotification(notification, userId, channels, optimalTime);
          
          return {
            success: true,
            scheduled: true,
            notificationId: notification.id,
            scheduledTime: new Date(optimalTime)
          };
        }
      }
      
      // Otherwise, send immediately
      return await this.processNotificationDelivery(notification, userId, channels, userProfile);
      
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error processing notification: ${error.message}`);
      return { success: false, error: error.message };
    } finally {
      // Record metrics for this operation
      this.metricsCollector.recordMetric('notification_processing_time', Date.now() - startTime, {
        userId,
        notificationId: notification.id,
        intent: notification.intent
      });
    }
  }
  
  /**
   * Process the actual delivery of a notification
   * @param {Object} notification Notification data
   * @param {string} userId User ID
   * @param {Array<string>} channels Channels to use
   * @param {Object} userProfile User profile data
   * @returns {Promise<Object>} Delivery results
   * @private
   */
  async processNotificationDelivery(notification, userId, channels, userProfile) {
    const results = {
      notificationId: notification.id,
      userId,
      timestamp: new Date(),
      channels: {},
      success: false,
      successfulChannels: [],
      failedChannels: [],
      abTest: notification.assignedVariant ? { variant: notification.assignedVariant } : null
    };
    
    // Check channel rate limits
    const validChannels = await this.filterRateLimitedChannels(channels, userId);
    
    if (validChannels.length === 0) {
      logger.warn(`AdvancedNotificationService: All channels rate limited for user ${userId}`);
      return { ...results, reason: 'rate_limited' };
    }
    
    // Apply any PII masking if enabled
    if (this.complianceConfig.piiDetectionEnabled) {
      notification = await this.privacyManager.maskPII(notification);
    }
    
    // Apply progressive content delivery if enabled
    if (this.progressiveDeliveryConfig.enabled) {
      notification = this.prepareProgressiveContent(notification);
    }
    
    // Track delivery attempt
    this.trackDeliveryAttempt(notification.id, userId, validChannels);
    
    // Send on each channel
    for (const channel of validChannels) {
      try {
        let channelResult;
        
        switch (channel) {
          case CHANNELS.EMAIL:
            channelResult = await this.sendEmailNotification(notification, userId, userProfile);
            break;
            
          case CHANNELS.WEB:
            channelResult = await this.sendWebNotification(notification, userId, userProfile);
            break;
            
          case CHANNELS.MOBILE:
            channelResult = await this.sendMobileNotification(notification, userId, userProfile);
            break;
            
          case CHANNELS.SMS:
            channelResult = await this.sendSmsNotification(notification, userId, userProfile);
            break;
            
          case CHANNELS.API:
            channelResult = await this.sendApiNotification(notification, userId, userProfile);
            break;
            
          case CHANNELS.SLACK:
            channelResult = await this.sendSlackNotification(notification, userId, userProfile);
            break;
            
          case CHANNELS.TEAMS:
            channelResult = await this.sendTeamsNotification(notification, userId, userProfile);
            break;
            
          case CHANNELS.DISCORD:
            channelResult = await this.sendDiscordNotification(notification, userId, userProfile);
            break;
            
          case CHANNELS.WHATSAPP:
            channelResult = await this.sendWhatsAppNotification(notification, userId, userProfile);
            break;
            
          default:
            channelResult = { success: false, reason: 'unknown_channel' };
        }
        
        results.channels[channel] = channelResult;
        
        if (channelResult.success) {
          results.successfulChannels.push(channel);
        } else {
          results.failedChannels.push(channel);
        }
        
      } catch (error) {
        logger.error(`AdvancedNotificationService: Error sending ${channel} notification: ${error.message}`);
        results.channels[channel] = { success: false, error: error.message };
        results.failedChannels.push(channel);
      }
    }
    
    // If channel fallback is enabled and no channels succeeded, try fallback
    if (this.fallbackConfig.enabled && 
        results.successfulChannels.length === 0 && 
        results.failedChannels.length > 0) {
      
      const fallbackResults = await this.executeChannelFallback(notification, userId, channels, userProfile);
      
      if (fallbackResults.success) {
        // Merge fallback results with original results
        results.fallbackUsed = true;
        results.successfulChannels = fallbackResults.successfulChannels;
        
        for (const [channel, result] of Object.entries(fallbackResults.channels)) {
          if (result.success) {
            results.channels[channel] = result;
          }
        }
      }
    }
    
    // Store delivery result
    await this.storeDeliveryResult(notification.id, userId, results);
    
    // Update final success status
    results.success = results.successfulChannels.length > 0;
    
    // Record metrics
    this.metricsCollector.recordMetric('notification_delivery_success', results.success ? 1 : 0, {
      userId,
      notificationId: notification.id,
      channels: channels.join(','),
      intent: notification.intent,
      variant: notification.assignedVariant
    });
    
    // If A/B testing is active, record the variant performance
    if (notification.assignedVariant) {
      this.metricsCollector.recordMetric('ab_test_delivery', results.success ? 1 : 0, {
        testId: notification.testId || 'default',
        variant: notification.assignedVariant,
        intent: notification.intent
      });
    }
    
    return results;
  }
  
  /**
   * Schedule a notification for future delivery
   * @param {Object} notification Notification data
   * @param {string} userId User ID
   * @param {Array<string>} channels Channels to use
   * @param {number} deliveryTime Timestamp for delivery
   * @returns {Promise<Object>} Schedule result
   * @private
   */
  async scheduleNotification(notification, userId, channels, deliveryTime) {
    if (!this.redisClient) {
      logger.warn('AdvancedNotificationService: Cannot schedule notification without Redis');
      return { success: false, reason: 'redis_not_available' };
    }
    
    try {
      const scheduleKey = `scheduled:${notification.id}`;
      const scheduleData = {
        notification,
        userId,
        channels,
        deliveryTime
      };
      
      // Store in Redis with expiration slightly after delivery time
      await this.redisClient.set(
        scheduleKey,
        JSON.stringify(scheduleData),
        { EX: Math.ceil((deliveryTime - Date.now()) / 1000) + 600 } // TTL = time until delivery + 10 minutes
      );
      
      // Add to sorted set for scheduled processing
      await this.redisClient.zAdd('scheduled_notifications', {
        score: deliveryTime,
        value: notification.id
      });
      
      logger.info(`AdvancedNotificationService: Scheduled notification ${notification.id} for delivery at ${new Date(deliveryTime).toISOString()}`);
      
      return {
        success: true,
        notificationId: notification.id,
        scheduledTime: new Date(deliveryTime)
      };
      
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error scheduling notification: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Send a scheduled notification
   * @param {string} notificationId Notification ID
   * @returns {Promise<Object>} Delivery result
   */
  async sendScheduledNotification(notificationId) {
    if (!this.redisClient) {
      return { success: false, reason: 'redis_not_available' };
    }
    
    try {
      const scheduleKey = `scheduled:${notificationId}`;
      const scheduleDataJson = await this.redisClient.get(scheduleKey);
      
      if (!scheduleDataJson) {
        return { success: false, reason: 'scheduled_notification_not_found' };
      }
      
      const scheduleData = JSON.parse(scheduleDataJson);
      
      // Remove from scheduled set
      await this.redisClient.zRem('scheduled_notifications', notificationId);
      
      // Delete schedule data
      await this.redisClient.del(scheduleKey);
      
      // Send the notification
      return await this.sendNotification(
        scheduleData.notification,
        scheduleData.userId,
        scheduleData.channels,
        { immediate: true }
      );
      
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error sending scheduled notification: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Add notification to a group based on intent
   * @param {Object} notification Notification data
   * @param {string} userId User ID
   * @param {Array<string>} channels Channels to use
   * @returns {Promise<boolean>} Whether notification was grouped
   * @private
   */
  async addToNotificationGroup(notification, userId, channels) {
    if (!this.redisClient || !notification.intent) {
      return false;
    }
    
    try {
      const now = Date.now();
      const groupKey = `notification_group:${userId}:${notification.intent}`;
      
      // Check if a group exists for this user/intent
      const groupJson = await this.redisClient.get(groupKey);
      
      if (groupJson) {
        // Group exists, add notification if within time window
        const group = JSON.parse(groupJson);
        
        if (now - group.createdAt < this.groupingConfig.groupingTimeWindow &&
            group.notifications.length < this.groupingConfig.maxGroupSize) {
          
          // Add to group
          group.notifications.push({
            id: notification.id,
            title: notification.title,
            message: notification.message,
            timestamp: notification.timestamp,
            data: notification.data,
            league: notification.league
          });
          
          // Update last updated time
          group.updatedAt = now;
          
          // Save updated group
          await this.redisClient.set(
            groupKey, 
            JSON.stringify(group),
            { EX: Math.ceil(this.groupingConfig.groupingTimeWindow / 1000) }
          );
          
          return true;
        }
      } else {
        // Create new group
        const group = {
          id: crypto.randomUUID(),
          userId,
          intent: notification.intent,
          createdAt: now,
          updatedAt: now,
          channels,
          notifications: [{
            id: notification.id,
            title: notification.title,
            message: notification.message,
            timestamp: notification.timestamp,
            data: notification.data,
            league: notification.league
          }]
        };
        
        // Save group
        await this.redisClient.set(
          groupKey,
          JSON.stringify(group),
          { EX: Math.ceil(this.groupingConfig.groupingTimeWindow / 1000) }
        );
        
        return true;
      }
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error adding to notification group: ${error.message}`);
    }
    
    return false;
  }
  
  /**
   * Process notification groups that are ready for delivery
   * @returns {Promise<void>}
   * @private
   */
  async processNotificationGroups() {
    if (!this.redisClient) {
      return;
    }
    
    try {
      // Scan Redis for all notification group keys
      const groupKeys = await this.scanRedisKeys('notification_group:*');
      const now = Date.now();
      
      for (const groupKey of groupKeys) {
        try {
          const groupJson = await this.redisClient.get(groupKey);
          
          if (!groupJson) {
            continue;
          }
          
          const group = JSON.parse(groupJson);
          
          // Check if group should be sent (time window expired or max size reached)
          if (now - group.createdAt >= this.groupingConfig.groupingTimeWindow ||
              group.notifications.length >= this.groupingConfig.maxGroupSize) {
            
            // Send grouped notification
            await this.sendGroupedNotification(group);
            
            // Delete the group
            await this.redisClient.del(groupKey);
          }
        } catch (err) {
          logger.error(`AdvancedNotificationService: Error processing group ${groupKey}: ${err.message}`);
        }
      }
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error processing notification groups: ${error.message}`);
    }
  }
  
  /**
   * Send a grouped notification
   * @param {Object} group Notification group
   * @returns {Promise<Object>} Delivery result
   * @private
   */
  async sendGroupedNotification(group) {
    try {
      // Get user profile
      const userProfile = await this.getUserProfile(group.userId);
      
      // Create a single notification from the group
      const groupedNotification = {
        id: group.id,
        title: this.generateGroupTitle(group),
        message: this.generateGroupMessage(group),
        intent: group.intent,
        timestamp: new Date(),
        isGrouped: true,
        groupSize: group.notifications.length,
        groupedIds: group.notifications.map(n => n.id),
        data: {
          notifications: group.notifications
        }
      };
      
      // If all notifications are from the same league, add league info
      const leagues = new Set(group.notifications.filter(n => n.league).map(n => n.league));
      if (leagues.size === 1) {
        groupedNotification.league = [...leagues][0];
      }
      
      // Send the grouped notification
      return await this.processNotificationDelivery(
        groupedNotification,
        group.userId,
        group.channels,
        userProfile
      );
      
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error sending grouped notification: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Generate a title for a grouped notification
   * @param {Object} group Notification group
   * @returns {string} Group title
   * @private
   */
  generateGroupTitle(group) {
    const count = group.notifications.length;
    
    switch (group.intent) {
      case INTENT.SCORE_UPDATE:
        return `${count} Score Updates`;
        
      case INTENT.PLAYER_PERFORMANCE:
        return `${count} Player Highlights`;
        
      case INTENT.GAME_START:
        return `${count} Games Starting Soon`;
        
      case INTENT.GAME_END:
        return `${count} Game Results`;
        
      case INTENT.INJURY_UPDATE:
        return `${count} Injury Updates`;
        
      case INTENT.TEAM_NEWS:
        return `${count} Team Updates`;
        
      case INTENT.TRANSFER_NEWS:
        return `${count} Transfer Updates`;
        
      case INTENT.BETTING_ODDS:
        return `${count} Odds Updates`;
        
      case INTENT.FANTASY_ALERT:
        return `${count} Fantasy Alerts`;
        
      default:
        return `${count} ${this.capitalizeFirst(group.intent.replace('_', ' '))} Updates`;
    }
  }
  
  /**
   * Generate a message for a grouped notification
   * @param {Object} group Notification group
   * @returns {string} Group message
   * @private
   */
  generateGroupMessage(group) {
    // Create a summary message based on the grouped notifications
    const itemMessages = group.notifications.map(n => {
      const timestamp = new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `• ${timestamp}: ${n.title}`;
    });
    
    return itemMessages.join('\n');
  }
  
  /**
   * Send batch notifications to multiple users
   * @param {Object} notification Base notification data
   * @param {Array<string>} userIds List of user IDs
   * @param {Object} options Additional options
   * @returns {Promise<Object>} Batch results
   */
  async sendBatchNotifications(notification, userIds, options = {}) {
    if (!this.enabled) {
      return { success: false, reason: 'service_disabled' };
    }
    
    if (!notification || !notification.title) {
      return { success: false, reason: 'invalid_notification' };
    }
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return { success: false, reason: 'no_users_specified' };
    }
    
    const batchId = options.batchId || crypto.randomUUID();
    const results = {
      batchId,
      timestamp: new Date(),
      totalUsers: userIds.length,
      successCount: 0,
      failureCount: 0,
      skippedCount: 0,
      detailedResults: {}
    };
    
    // If personalization is enabled, prefetch necessary data
    let userData = {};
    if (options.personalize) {
      userData = await this.batchFetchUserData(userIds);
    }
    
    // Process in smaller batches to avoid overwhelming the system
    const batchSize = options.batchSize || 100;
    const batches = [];
    
    for (let i = 0; i < userIds.length; i += batchSize) {
      batches.push(userIds.slice(i, i + batchSize));
    }
    
    for (const userBatch of batches) {
      const batchPromises = userBatch.map(async (userId) => {
        try {
          // Check if user has opted out of this type of notification
          const userConsent = await this.checkUserConsent(userId, notification);
          
          if (!userConsent) {
            results.skippedCount++;
            results.detailedResults[userId] = { status: 'skipped', reason: 'consent_not_provided' };
            return;
          }
          
          // Personalize notification if enabled
          let userNotification = { ...notification };
          
          if (options.personalize && userData[userId]) {
            userNotification = this.personalizeNotification(userNotification, userData[userId]);
          }
          
          // Determine channels for this user
          const channels = options.channels || await this.getUserPreferredChannels(userId, userNotification);
          
          // Send notification
          const sendResult = await this.sendNotification(
            userNotification, 
            userId, 
            channels,
            { 
              batchId,
              immediate: options.immediate,
              bypassGrouping: options.bypassGrouping
            }
          );
          
          // Update results
          if (sendResult.success) {
            results.successCount++;
            results.detailedResults[userId] = { status: 'success', notificationId: sendResult.notificationId };
          } else {
            results.failureCount++;
            results.detailedResults[userId] = { 
              status: 'failure', 
              reason: sendResult.reason || sendResult.error,
              notificationId: sendResult.notificationId
            };
          }
        } catch (error) {
          results.failureCount++;
          results.detailedResults[userId] = { status: 'failure', reason: error.message };
        }
      });
      
      await Promise.all(batchPromises);
    }
    
    // Update overall success status
    results.success = results.successCount > 0;
    
    // Store batch results
    if (this.redisClient) {
      try {
        await this.redisClient.set(
          `batch_result:${batchId}`,
          JSON.stringify({
            batchId,
            timestamp: results.timestamp,
            totalUsers: results.totalUsers,
            successCount: results.successCount,
            failureCount: results.failureCount,
            skippedCount: results.skippedCount
          }),
          { EX: 86400 * 7 } // 7 days
        );
      } catch (error) {
        logger.error(`AdvancedNotificationService: Error storing batch results: ${error.message}`);
      }
    }
    
    return results;
  }
  
  /**
   * Fetch user data in batch for personalization
   * @param {Array<string>} userIds User IDs
   * @returns {Promise<Object>} User data by ID
   * @private
   */
  async batchFetchUserData(userIds) {
    const userData = {};
    
    try {
      // In a real implementation, this would query the database in batch
      // For now, fetch each user individually
      for (const userId of userIds) {
        userData[userId] = await this.getUserProfile(userId);
      }
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error fetching batch user data: ${error.message}`);
    }
    
    return userData;
  }
  
  /**
   * Personalize a notification for a specific user
   * @param {Object} notification Base notification
   * @param {Object} userData User data for personalization
   * @returns {Object} Personalized notification
   * @private
   */
  personalizeNotification(notification, userData) {
    const personalized = { ...notification };
    
    try {
      // Replace placeholders in title and message
      if (userData.firstName) {
        personalized.title = personalized.title.replace('{firstName}', userData.firstName);
        personalized.message = personalized.message?.replace('{firstName}', userData.firstName);
      }
      
      if (userData.lastName) {
        personalized.title = personalized.title.replace('{lastName}', userData.lastName);
        personalized.message = personalized.message?.replace('{lastName}', userData.lastName);
      }
      
      if (userData.favoriteTeam) {
        personalized.title = personalized.title.replace('{favoriteTeam}', userData.favoriteTeam);
        personalized.message = personalized.message?.replace('{favoriteTeam}', userData.favoriteTeam);
      }
      
      // Add user-specific data if available
      if (!personalized.data) {
        personalized.data = {};
      }
      
      // Add favorite teams and players if available
      if (userData.favoriteTeams) {
        personalized.data.favoriteTeams = userData.favoriteTeams;
      }
      
      if (userData.favoritePlayers) {
        personalized.data.favoritePlayers = userData.favoritePlayers;
      }
      
      // Set personalized priority
      personalized.priority = PRIORITY.PERSONALIZED;
    } catch (error) {
      logger.error(`AdvancedNotificationService: Error personalizing notification: ${error.message}`);
    }
    
    return personalized;
  }
  
  /**
   * Send email notification
   * @param {Object} notification Notification data
   * @param {string} userId User ID
   * @param {Object} userProfile User profile data
   * @returns {Promise<Object>} Delivery result
   * @private
   */
  async sendEmailNotification(notification, userId, userProfile) {
    if (!this.emailTransport) {
      return { success: false, reason: 'email_transport_not_configured' };
    }
    
    try {
      // Get user email address
      const userEmail = userProfile?.email || await this.getUserEmail(userId);
      
      if (!userEmail) {
        return { success: false, reason: 'email_not_found' };
      }
      
      // Generate email content based on sentiment and notification data
      const emailContent = await this.generateEmailContent(notification, userProfile);
      
      // Set subject based on priority and sentiment
      let subject = notification.title;
      if (notification.sentiment && this.sentimentConfig.adjustTone) {
        // For very negative news, add a softer tone
        if (notification.sentiment === SENTIMENT.VERY_NEGATIVE) {
          subject = `Update: ${subject}`;
        } else if (notification.sentiment === SENTIMENT.VERY_POSITIVE) {
          subject = `🎉 ${subject}`;
        }
      } else {
        // Default priority-based prefixes
        if (notification.priority === PRIORITY.HIGH) {
          subject = `[IMPORTANT] ${subject}`;
        } else if (notification.priority === PRIORITY.CRITICAL) {
          subject = `[URGENT] ${subject}`;
        } else if (notification.priority === PRIORITY.BREAKING) {
          subject = `[BREAKING] ${subject}`;
        }
      }
      
      // Add league prefix if available
      if (notification.league) {
        subject = `[${this.getLeagueDisplayName(notification.league)}] ${subject}`;
      }
      
      // Send email
      const result = await this.emailTransport.sendMail({
        from: notification.sender || this.defaultSender,
        to: userEmail,
        subject: subject,
        html: emailContent,
        headers: {
          'X-Notification-ID': notification.id,
          'X-Notification-Priority': notification.priority || PRIORITY.MEDIUM,
          'X-Notification-Intent': notification.intent || 'unknown',
          'X-Notification-League': notification.league || 'unknown'
        }
      });
      
      // Track event for analytics
      this.metricsCollector.recordMetric('email_sent', 1, {
        userId,
        notificationId: notification.id,
        intent: notification.intent,
        priority: notification.priority,
        league: notification.league
      });
      
      return {
        success: true,
        messageId: result.messageId,
        recipient: userEmail
      };
      
    } catch (error) {
      logger.error(`AdvancedNotificationService: Email delivery error: ${error.message}`);
      
      // Check if we should retry
      const deliveryAttempts = this.getDeliveryAttempts(notification.id, userId, CHANNELS.EMAIL);
      
      if (deliveryAttempts < this.retryConfig.maxRetries) {
        // Schedule retry with exponential backoff
        const retryDelay = Math.min(
          this.retryConfig.retryDelay * Math.pow(this.retryConfig.retryBackoff, deliveryAttempts),
          this.retryConfig.maxRetryDelay
        );
        
        setTimeout(() => {
          this.retryNotification(notification, userId, [CHANNELS.EMAIL], null)
            .catch(err => logger.error(`AdvancedNotificationService: Email retry error: ${err.message}`));
        }, retryDelay);
        
        return { 
          success: false, 
          reason: 'temporary_failure',
          willRetry: true,
          nextRetry: new Date(Date.now() + retryDelay)
        };
      }
      
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Send web notification (browser)
   * @param {Object} notification Notification data
   * @param {string} userId User ID
   * @param {Object} userProfile User profile data
   * @returns {Promise<Object>} Delivery result
   * @private
   */
  async sendWebNotification(notification, userId, userProfile) {
    try {
      if (!this.redisClient) {
        return { success: false, reason: 'redis_not_available' };
      }
      
      // Store notification in Redis for client retrieval
      const notificationKey = `notification:web:${userId}:${notification.id}`;
      
      // Process notification for web display (for progressive delivery)
      const webNotification = { ...notification };
      
      // If progressive delivery is enabled and notification has full content
      if (this.progressiveDeliveryConfig.enabled && notification.fullContent) {
        // Store the detailed content separately with the same ID
        const detailsKey = `notification:details:${notification.id}`;
        
        await this.redisClient.set(
          detailsKey,
          JSON.stringify({
            fullContent: notification.fullContent,
            data: notification.data
          }),
          { EX: Math.ceil(this.progressiveDeliveryConfig.detailsExpiryTime / 1000) }
        );
        
        // Remove fullContent from the main notification to keep it light
        delete webNotification.fullContent;
        
        // Add flag that more content is available
        webNotification.hasMoreContent = true;
      }
      
      // Add web-specific data
      webNotification.delivered = false;
      webNotification.read = false;
      webNotification.channel = CHANNELS.WEB;
      webNotification.deliveryTimestamp = new Date();
      
      // For grouped notifications, include all notification IDs
      if (notification.isGrouped && notification.groupedIds) {
        webNotification.groupedIds = notification.groupedIds;
      }
      
      // Store notification with appropriate TTL
      await this.redisClient.set(
        notificationKey,
        JSON.stringify(webNotification),
        { EX: 60 * 60 * 24 * 7 } // 7 days expiry
      );
      
      // Add to user's notification list
      await this.redisClient.lPush(`notifications:${userId}`, notificationKey);
      await this.redisClient.lTrim(`notifications:${userId}`, 0, 99); // Keep last 100 notifications
      
      // If web push is configured, send push notification
      if (this.webPushManager) {
        try {
          const subscriptions = await this.getUserWebPushSubscriptions(userId);
          
          if (subscriptions && subscriptions.length > 0) {
            for (const subscription of subscriptions) {
              try {
                // Create a more minimal payload for push
                const pushPayload = {
                  title: notification.title,
                  body: notification.summary || notification.message,
                  icon: this.getLogoForLeague(notification.league),
                  data: {
                    url: `/notifications/${notification.id}`,
                    notificationId: notification.id,
                    timestamp: notification.timestamp
                  }
                };
                
                await this.webPushManager.sendNotification(subscription, pushPayload);
              } catch (pushError) {
                // If subscription is invalid, remove it
                if (pushError.statusCode === 410) { // Gone - subscription expired
                  await this.removeInvalidWebPushSubscription(userId, subscription);
                } else {
                  logger.error(`AdvancedNotificationService: Web push error: ${pushError.message}`);
                }
              }
            }
          }
        } catch (pushError) {
          logger.error(`AdvancedNotificationService: Web push setup error: ${pushError.message}`);
        }
      }
      
      // Track event for analytics
      this.metricsCollector.recordMetric('web_notification_sent', 1, {
        userId,
        notificationId: notification.id,
        intent: notification.intent,
        priority: notification.priority,
        league: notification.league
      });
      
      return { success: true };
      
    } catch (error) {
      logger.error(`AdvancedNotificationService: Web notification error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Send mobile push notification
   * @param {Object} notification Notification data
   * @param {string} userId User ID
   * @param {Object} userProfile User profile data
   * @returns {Promise<Object>} Delivery result
   * @private
   */
  async sendMobileNotification(notification, userId, userProfile) {
    if (!this.firebaseMessaging) {
      return { success: false, reason: 'push_not_configured' };
    }
    
    try {
      // Get user's device tokens
      const deviceTokens = await this.getUserDeviceTokens(userId);
      
      if (!deviceTokens || deviceTokens.length === 0) {
        return { success: false, reason: 'no_device_tokens' };
      }
      
      // Customize notification based on sentiment if enabled
      let title = notification.title;
      let body = notification.summary || notification.message || '';
      
      if (this.sentimentConfig.adjustTone && notification.sentiment) {
        if (notification.sentiment === SENTIMENT.VERY_NEGATIVE) {
          // Soften the tone for very negative news
          title = `Update: ${title}`;
        } else if (notification.sentiment === SENTIMENT.VERY_POSITIVE) {
          // Add excitement for very positive news
          title = `🎉 ${title}`;
        }
      }
      
      // Add league information if available
      if (notification.league) {
        title = `[${this.getLeagueDisplayName(notification.league)}] ${title}`;
      }
      
      // Prepare notification payload
      const payload = {
        notification: {
          title,
          body,
          android_channel_id: this.getPriorityChannel(notification),
          icon: this.getIconForNotification(notification),
          sound: this.getSoundForNotification(notification),
          tag: notification.isGrouped ? notification.intent : notification.id
        },
        data: {
          notificationId: notification.id,
          intent: notification.intent || 'unknown',
          priority: notification.priority || PRIORITY.MEDIUM,
          league: notification.league || 'unknown',
          timestamp: notification.timestamp.toString(),
          click_action: 'OPEN_NOTIFICATION_DETAILS'
        }
      };
      
      // Add deep link data if available
      if (notification.data && notification.data.deepLink) {
        payload.data.deepLink = notification.data.deepLink;
      }
      
      // Add group data if this is a grouped notification
      if (notification.isGrouped) {
        payload.data.isGrouped = 'true';
        payload.data.groupSize = notification.groupSize.toString();
      }
      
      // For Android, configure channel priority based on notification priority
      let options = {
        priority: 'high',
        timeToLive: 60 * 60 * 24 // 24 hours
      };
      
      if (notification.priority === PRIORITY.LOW) {
        options.priority = 'normal';
      } else if (notification.priority === PRIORITY.CRITICAL || notification.priority === PRIORITY.BREAKING) {
        options.priority = 'high';
        payload.notification.android_channel_id = 'critical_alerts';
      }
      
      // Send to all devices
      const response = await this.firebaseMessaging.sendMulticast({
        tokens: deviceTokens,
        ...payload
      }, options);
      
      // Track invalid tokens
      if (response.failureCount > 0) {
        const invalidTokens = [];
        
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            // Check for invalid token error
            if (resp.error && resp.error.code === 'messaging/invalid-registration-token') {
              invalidTokens.push(deviceTokens[idx]);
            }
          }
        });
        
        // Remove invalid tokens
        if (invalidTokens.length > 0) {
          this.removeInvalidDeviceTokens(userId, invalidTokens)
            .catch(err => logger.error(`Error removing invalid tokens: ${err.message}`));
        }
      }
      
      // Track event for analytics
      this.metricsCollector.recordMetric('push_notification_sent', 1, {
        userId,
        notificationId: notification.id,
        intent: notification.intent,
        priority: notification.priority,
        league: notification.league,
        successCount: response.successCount,
        failureCount: response.failureCount
      });
      
      return {
        success: response.successCount > 0,
        successCount: response.successCount,
        failureCount: response.failureCount
      };
      
    } catch (error) {
      logger.error(`AdvancedNotificationService: Mobile push error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Send SMS text message
   * @param {Object} notification Notification data
   * @param {string} userId User ID
   * @param {Object} userProfile User profile data
   * @returns {Promise<Object>} Delivery result
   * @private
   */
  async sendSmsNotification(notification, userId, userProfile) {
    if (!this.twilioClient || !this.twilioPhoneNumber) {
      return { success: false, reason: 'sms_not_configured' };
    }
    
    try {
      // Get user phone number
      const phoneNumber = userProfile?.phoneNumber || await this.getUserPhoneNumber(userId);
      
      if (!phoneNumber) {
        return { success: false, reason: 'phone_number_not_found' };
      }
      
      // Generate SMS content
      // SMS should be brief and to the point
      let smsContent = notification.title;
      
      // For grouped notifications, include count
      if (notification.isGrouped) {
        smsContent = `${notification.title} (${notification.groupSize} updates)`;
      } 
      
      // Add message if not too long
      if (notification.summary) {
        smsContent += `\n${notification.summary}`;
      } else if (notification.message && notification.message.length < 100) {
        smsContent += `\n${notification.message}`;
      }
      
      // Add league context if available
      if (notification.league) {
        smsContent = `[${this.getLeagueDisplayName(notification.league)}] ${smsContent}`;
      }
      
      // Adjust tone based on sentiment if enabled
      if (this.sentimentConfig.adjustTone && notification.sentiment) {
        if (notification.sentiment === SENTIMENT.VERY_NEGATIVE) {
          // Soften the tone for very negative news
          smsContent = `Update: ${smsContent}`;
        }
      }
      
      // Send SMS via Twilio
      const message = await this.twilioClient.messages.create({
        body: smsContent,
        from: this.twilioPhoneNumber,
        to: phoneNumber,
        statusCallback: process.env.SMS_STATUS_WEBHOOK_URL // Optional webhook for delivery status
      });
      
      // Track event for analytics
      this.metricsCollector.recordMetric('sms_sent', 1, {
        userId,
        notificationId: notification.id,
        intent: notification.intent,
        priority: notification.priority,
        league: notification.league
      });
      
      return {
        success: true,
        messageId: message.sid,
        recipient: phoneNumber,
        status: message.status
      };
      
    } catch (error) {
      logger.error(`AdvancedNotificationService: SMS delivery error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Send notification to external API (webhook)
   * @param {Object} notification Notification data
   * @param {string} userId User ID
   * @param {Object} userProfile User profile data
   * @returns {Promise<Object>} Delivery result
   * @private
   */
  async sendApiNotification(notification, userId, userProfile) {
    try {
      // Get webhook URL for this user
      const webhookUrl = userProfile?.webhookUrl || await this.getUserWebhookUrl(userId);
      
      if (!webhookUrl) {
        return { success: false, reason: 'webhook_not_configured' };
      }
      
      // Generate signature for security
      const signature = this.generateWebhookSignature(notification, userId);
      
      // Prepare notification payload with progressive content structure
      let payload = {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        summary: notification.summary || notification.message,
        priority: notification.priority || PRIORITY.MEDIUM,
        intent: notification.intent,
        timestamp: notification.timestamp,
        user_id: userId,
        league: notification.league,
        sentiment: notification.sentiment
      };
      
      // Add data if available (but not fullContent to keep payload size reasonable)
      if (notification.data) {
        payload.data = { ...notification.data };
        
        // Remove any PII from data for API consumption
        if (this.complianceConfig.piiDetectionEnabled) {
          payload.data = this.privacyManager.maskPIIInObject(payload.data);
        }
      }
      
      // For grouped notifications, include details
      if (notification.isGrouped) {
        payload.isGrouped = true;
        payload.groupSize = notification.groupSize;
        payload.notifications = notification.data.notifications;
      }
      
      // Send webhook request
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Notification-Signature': signature,
          'X-Notification-ID': notification.id,
          'X-User-ID': userId
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }
      
      // Track event for analytics
      this.metricsCollector.recordMetric('api_notification_sent', 1, {
        userId,
        notificationId: notification.id,
        intent: notification.intent,
        priority: notification.priority,
        league: notification.league
      });
      
      return {
        success: true,
        statusCode: response.status,
        endpoint: webhookUrl
      };
      
    } catch (error) {
      logger.error(`AdvancedNotificationService: API webhook error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Send notification to Slack
   * @param {Object} notification Notification data
   * @param {string} userId User ID
   * @param {Object} userProfile User profile data
   * @returns {Promise<Object>} Delivery result
   * @private
   */
  async sendSlackNotification(notification, userId, userProfile) {
    if (!this.slackClient) {
      return { success: false, reason: 'slack_not_configured' };
    }
    
    try {
      // Get user's Slack channel ID
      const slackChannelId = userProfile?.slackChannelId || await this.getUserSlackChannel(userId);
      
      if (!slackChannelId) {
        return { success: false, reason: 'slack_channel_not_found' };
      }
      
      // Create Slack message blocks
      const blocks = [];
      
      // Header with notification title
      blocks.push({
        type: 'header',
        text: {
          type: 'plain_text',
          text: notification.title,
          emoji: true
        }
      });
      
      // Add league context if available
      if (notification.league) {
        blocks.push({
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `*League:* ${this.getLeagueDisplayName(notification.league)}`
            }
          ]
        });
      }
      
      // Add message content
      if (notification.message) {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: notification.message
          }
        });
      }
      
      // For grouped notifications, add list of included notifications
      if (notification.isGrouped && notification.data.notifications) {
        const notificationList = notification.data.notifications.map(n => {
          return `• *${n.title}*`;
        }).join('\n');
        
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: notificationList
          }
        });
      }
      
      // Add notification metadata
      blocks.push({
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Priority: ${notification.priority || PRIORITY.MEDIUM} | ID: ${notification.id}`
          }
        ]
      });
      
      // Add divider
      blocks.push({
        type: 'divider'
      });
      
      // Send message to Slack
      const result = await this.slackClient.chat.postMessage({
        channel: slackChannelId,
        text: notification.title, // Fallback text
        blocks: blocks,
        unfurl_links: false,
        unfurl_media: false
      });
      
      // Track event for analytics
      this.metricsCollector.recordMetric('slack_notification_sent', 1, {
        userId,
        notificationId: notification.id,
        intent: notification.intent,
        priority: notification.priority,
        league: notification.league
      });
      
      return {
        success: true,
        messageId: result.ts,
        channel: slackChannelId
      };
      
    } catch (error) {
      logger.error(`AdvancedNotificationService: Slack notification error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Send notification to Microsoft Teams
   * @param {Object} notification Notification data
   * @param {string} userId User ID
   * @param {Object} userProfile User profile data
   * @returns {Promise<Object>} Delivery result
   * @private
   */
  async sendTeamsNotification(notification, userId, userProfile) {
    if (!this.teamsClient) {
      return { success: false, reason: 'teams_not_configured' };
    }
    
    try {
      // Get user's Teams webhook URL
      const teamsWebhookUrl = userProfile?.teamsWebhookUrl || await this.getUserTeamsWebhook(userId);
      
      if (!teamsWebhookUrl) {
        return { success: false, reason: 'teams_webhook_not_found' };
      }
      
      // Get color based on priority and sentiment
      let cardColor = '#0078D7'; // Default blue
      
      if (notification.priority === PRIORITY.CRITICAL || notification.priority === PRIORITY.BREAKING) {
        cardColor = '#D13438'; // Red
      } else if (notification.priority === PRIORITY.HIGH) {
        cardColor = '#FFB900'; // Yellow
      } else if (this.sentimentConfig.adjustTone && notification.sentiment) {
        if (notification.sentiment === SENTIMENT.VERY_NEGATIVE) {
          cardColor = '#FF8C00'; // Orange
        } else if (notification.sentiment === SENTIMENT.VERY_POSITIVE) {
          cardColor = '#107C10'; // Green
        }
      }
      
      // Create adaptive card for Teams
      const card = {
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: {
              $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
              type: 'AdaptiveCard',
              version: '1.2',
              body: [
                {
                  type: 'TextBlock',
                  text: notification.title,
                  weight: 'bolder',
                  size: 'large',
                  color: notification.priority === PRIORITY.CRITICAL ? 'attention' : 'default'
                }
              ]
            }
          }
        ]
      };
      
      // Add league information if available
      if (notification.league) {
        card.attachments[0].content.body.push({
          type: 'TextBlock',
          text: `League: ${this.getLeagueDisplayName(notification.league)}`,
          isSubtle: true,
          spacing: 'small'
        });
      }
      
      // Add message content
      if (notification.message) {
        card.attachments[0].content.body.push({
          type: 'TextBlock',
          text: notification.message,
          wrap: true,
          spacing: 'medium'
        });
      }
      
      // For grouped notifications, add list of included notifications
      if (notification.isGrouped && notification.data.notifications) {
        const factSet = {
          type: 'FactSet',
          facts: notification.data.notifications.map(n => ({
            title: new Date(n.timestamp).toLocaleTimeString(),
            value: n.title
          }))
        };
        
        card.attachments[0].content.body.push(factSet);
      }
      
      // Add footer information
      card.attachments[0].content.body.push({
        type: 'TextBlock',
        text: `Priority: ${notification.priority || PRIORITY.MEDIUM} | ${new Date(notification.timestamp).toLocaleString()}`,
        isSubtle: true,
        size: 'small',
        spacing: 'medium'
      });
      
      // Send message to Teams
      const result = await this.teamsClient.sendMessage(teamsWebhookUrl, card);
      
      // Track event for analytics
      this.metricsCollector.recordMetric('teams_notification_sent', 1, {
        userId,
        notificationId: notification.id,
        intent: notification.intent,
        priority: notification.priority,
        league: notification.league
      });
      
      return {
        success: true,
        statusCode: result.status,
        webhook: teamsWebhookUrl
      };
      
    } catch (error) {
      logger.error(`AdvancedNotificationService: Teams notification error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Send notification to Discord
   * @param {Object} notification Notification data
   * @param {string} userId User ID
   * @param {Object} userProfile User profile data
   * @returns {Promise<Object>} Delivery result
   * @private
   */
  async sendDiscordNotification(notification, userId, userProfile) {
    if (!this.discordClient) {
      return { success: false, reason: 'discord_not_configured' };
    }
    
    try {
      // Get user's Discord channel ID
      const discordChannelId = userProfile?.discordChannelId || await this.getUserDiscordChannel(userId);
      
      if (!discordChannelId) {
        return { success: false, reason: 'discord_channel_not_found' };
      }
      
      // Get embed color based on priority and sentiment
      let embedColor = 0x3498DB; // Default blue
      
      if (notification.priority === PRIORITY.CRITICAL || notification.priority === PRIORITY.BREAKING) {
        embedColor = 0xE74C3C; // Red
      } else if (notification.priority === PRIORITY.HIGH) {
        embedColor = 0xF1C40F; // Yellow
      } else if (this.sentimentConfig.adjustTone && notification.sentiment) {
        if (notification.sentiment === SENTIMENT.VERY_NEGATIVE) {
          embedColor = 0xE67E22; // Orange
        } else if (notification.sentiment === SENTIMENT.VERY_POSITIVE) {
          embedColor = 0x2ECC71; // Green
        }
      }
      
      // Create Discord embed
      const embed = {
        title: notification.title,
        description: notification.message || '',
        color: embedColor,
        timestamp: new Date(notification.timestamp).toISOString(),
        footer: {
          text: `Notification ID: ${notification.id}`
        }
      };
      
      // Add league information if available
      if (notification.league) {
        embed.author = {
          name: this.getLeagueDisplayName(notification.league)
        };
      }
      
      // For grouped notifications, add list of included notifications
      if (notification.isGrouped && notification.data.notifications) {
        embed.fields = notification.data.notifications.map(n => ({
          name: new Date(n.timestamp).toLocaleTimeString(),
          value: n.title,
          inline: false
        }));
      }
      
      // Send message to Discord
      const result = await this.discordClient.sendEmbed(discordChannelId, embed);
      
      // Track event for analytics
      this.metricsCollector.recordMetric('discord_notification_sent', 1, {
        userId,
        notificationId: notification.id,
        intent: notification.intent,
        priority: notification.priority,
        league: notification.league
      });
      
      return {
        success: true,
        messageId: result.id,
        channelId: discordChannelId
      };
      
    } catch (error) {
      logger.error(`AdvancedNotificationService: Discord notification error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
  
  /**
   * Send notification via WhatsApp
   * @param {Object} notification Notification data
   * @param {string} userId User ID
   * @param {Object} userProfile User profile data
   * @returns {Promise<Object>} Delivery result
   * @private
   */
  async sendWhatsAppNotification(notification, userId, userProfile) {
    if (!this.whatsappClient) {
      return { success: false, reason: 'whatsapp_not_configured' };
    }
    
    try {
      // Get user's WhatsApp phone number
      const whatsappNumber = userProfile?.whatsappNumber || await this.getUserWhatsAppNumber(userId);
      
      if (!whatsappNumber) {
        return { success: false, reason: 'whatsapp_number_not_found' };
      }
      
      // Build message content
      let messageContent = `*${notification.title}*\n\n`;
      
      // Add league information if available
      if (notification.league) {
        messageContent += `*League:* ${this.getLeagueDisplayName(notification.league)}\n`;
      }
      
      // Add message body
      if (notification.message) {
        messageContent += `${notification.message}\n\n`;
      }
      
      // For grouped notifications, add list of included notifications
      if (notification.isGrouped && notification.data.notifications) {
        messageContent += '*Updates:*\n';
        
        for (const n of notification.data.notifications) {
          const time = new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          messageContent += `• ${time}: ${n.title}\n`;
        }
        
        messageContent += '\n';
      }
      
      // Add footer with priority information
      messageContent += `_Priority: ${notification.priority || PRIORITY.MEDIUM}_\n`;
      messageContent += `_Notification ID: ${notification.id}_`;
      
      // Send message via WhatsApp
      const result = await this.whatsappClient.sendMessage(whatsappNumber, messageContent);
      
      // Track event for analytics
      this.metricsCollector.recordMetric('whatsapp_notification_sent', 1, {
        userId,
        notificationId: notification.id,
        intent: notification.intent,
        priority: notification.priority,
        league: notification.league
      });
      
      return {
        success: true,
        messageId: result.id,
        recipient: whatsappNumber
      };
      
    } catch (error) {
      logger.error(`AdvancedNotificationService: WhatsApp notification error: ${error.message}`);
      return { success: false, error: error.message };
    }
      
      //