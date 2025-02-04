├── client/               # Frontend React application
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/       # Route components
│   │   ├── hooks/       # Custom React hooks
│   │   └── lib/         # Utility functions
├── server/              # Backend Express application
│   ├── routes/         # API routes
│   ├── services/       # Business logic
│   └── lib/           # Helper utilities
├── db/                 # Database schemas and migrations
└── scripts/           # Utility scripts
```

## Setup Instructions

1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd shifi-lend
   ```

2. **Environment Setup**
   ```bash
   # Copy environment template
   cp .env.example .env

   # Configure required variables:
   CLIENT_ID=your_didit_client_id
   CLIENT_SECRET=your_didit_client_secret
   SHARED_SECRET_KEY=your_didit_webhook_secret
   DATABASE_URL=your_postgresql_url
   ```

3. **Install Dependencies**
   ```bash
   npm install
   ```

4. **Database Setup**
   ```bash
   # Push schema to database
   npm run db:push
   ```

5. **Start Development Server**
   ```bash
   npm run dev