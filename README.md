# Copy environment template
   cp .env.example .env

   # Configure required variables:
   CLIENT_ID=your_didit_client_id
   CLIENT_SECRET=your_didit_client_secret
   SHARED_SECRET_KEY=your_didit_webhook_secret
   DATABASE_URL=your_postgresql_url
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Database Setup**
   ```bash
   # Push schema to database
   npm run db:push
   ```

4. **Start Development Server**
   The project is configured to run automatically through Replit's workflow system.
   Simply click the "Run" button in your Replit workspace.

## Port Configuration

The application uses the following ports:
- 5000: Main application server
- 5001: Development server
- 5002: API server

## KYC Integration Details

### Mobile Verification Flow

1. **Initialization**
   - User triggers verification within the app
   - System detects mobile platform
   - Creates verification session with Didit

2. **Mobile App Integration**
   - Seamless deep linking to Didit app
   - Automatic app installation prompt if needed
   - Native platform optimizations

3. **Status Monitoring**
   - Real-time status updates via webhooks
   - Session management and recovery
   - Comprehensive error handling

## Testing

The project includes comprehensive tests for all major features:

```bash
# Run all tests
npm test

# Run KYC flow tests specifically
npm test -- -t "KYC Flow"