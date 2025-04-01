# Authentication and WebSocket Files Documentation

This document explains the purpose of each authentication and WebSocket file in the Sports Analytics application.

## Authentication Files

### 1. `/public/js/auth.js`
- **Purpose**: Main client-side authentication for public pages
- **Used by**: Login, signup, and other public pages
- **Features**: 
  - Basic authentication checks
  - Login form handling
  - Token storage and retrieval
  - Public page detection

### 2. `/public/dashboard/scripts/auth.js`
- **Purpose**: Dashboard-specific authentication
- **Used by**: Dashboard pages
- **Features**:
  - Token verification
  - User profile fetching
  - Auth headers setup for dashboard API calls

### 3. `/public/dashboard/scripts/security/auth.js`
- **Purpose**: Advanced security features for dashboard
- **Used by**: Dashboard with enhanced security requirements
- **Features**:
  - Token rotation
  - Session management
  - WebSocket security
  - Offline queue
  - Activity monitoring

### 4. `/middleware/auth.js`
- **Purpose**: Server-side authentication middleware
- **Used by**: Express routes that require authentication
- **Features**:
  - Token verification
  - User data attachment to request
  - Admin authorization

### 5. `/auth/authMiddleware.js`
- **Purpose**: Advanced server-side authentication middleware
- **Used by**: Server-side routes with enhanced security requirements
- **Features**:
  - Circuit breaker pattern
  - Rate limiting
  - Token blacklisting
  - Security metrics

## WebSocket Files

### 1. `/public/js/websocket.js`
- **Purpose**: Simple WebSocket client for basic connectivity
- **Used by**: Protected pages that need basic real-time updates
- **Features**:
  - Basic WebSocket connection
  - Reconnection logic
  - Simple message handling

### 2. `/public/dashboard/scripts/websocket.js`
- **Purpose**: Advanced WebSocket client for dashboard
- **Used by**: Dashboard pages with complex real-time requirements
- **Features**:
  - Subscription management
  - Reconnection with backoff
  - Message routing
  - Connection state management

### 3. `/utils/websocketManager.js`
- **Purpose**: Server-side WebSocket manager
- **Used by**: API server for managing WebSocket connections
- **Features**:
  - Client tracking
  - Channel subscriptions
  - Broadcasting
  - Connection monitoring

### 4. `/utils/websocket-server.js`
- **Purpose**: Enhanced WebSocket server implementation
- **Used by**: Advanced real-time features
- **Features**:
  - Memory management
  - Security features
  - Metrics collection
  - Graceful shutdown

## Usage Guidelines

1. **Public Pages**:
   - Use `/public/js/auth.js` for authentication
   - Use `/public/js/websocket.js` for basic WebSocket functionality

2. **Dashboard Pages**:
   - Use `/public/dashboard/scripts/auth.js` or `/public/dashboard/scripts/security/auth.js` for authentication
   - Use `/public/dashboard/scripts/websocket.js` for WebSocket functionality

3. **Server-Side**:
   - Use `/middleware/auth.js` for basic route protection
   - Use `/auth/authMiddleware.js` for advanced security features
   - Use `/utils/websocketManager.js` for WebSocket server functionality

## Important Notes

1. **Do not remove any of these files** as they serve different purposes and are used by different parts of the application.

2. **WebSocket initialization** is handled automatically based on the page type:
   - The simple WebSocket client only initializes on protected non-dashboard pages
   - The dashboard WebSocket client only initializes on dashboard pages

3. **Authentication initialization** is also handled automatically:
   - Public pages use the basic auth.js
   - Dashboard pages use the dashboard-specific auth implementations