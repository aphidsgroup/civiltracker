# Civil Tracker — Construction Management SaaS

> Track every site, every bill, every labour payment, every material, and every rupee — from mobile.

## Demo Accounts

| Role | Email | Password |
|------|-------|----------|
| Super Admin | admin@civiltracker.in | Admin@123456 |
| Company Admin | arun@madras-crafters.in | Admin@123456 |
| Site Engineer | murugan@madras-crafters.in | Admin@123456 |
| Accountant | priya@madras-crafters.in | Admin@123456 |
| Client | client@annanagar.in | Admin@123456 |

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Vanilla CSS
- **Database**: Neon PostgreSQL via Prisma 5
- **Auth**: NextAuth v5 (credentials)
- **Storage**: Cloudinary
- **Deployment**: Vercel

## Features

- Multi-tenant SaaS with company isolation
- Role-based access (Super Admin → Client)
- Site management with budget tracking
- Expense/bill management with approval workflow
- Labour attendance & salary runs
- Material stock management with low-stock alerts
- Daily Progress Reports (DPR) with photo upload
- BOQ management
- Client portal with project visibility
- PWA installable on mobile

## Getting Started

```bash
# Install dependencies
npm install

# Setup environment
cp .env.example .env.local
# Fill in DATABASE_URL, NEXTAUTH_SECRET, CLOUDINARY_*

# Push schema to database
npx prisma db push

# Seed demo data
npm run db:seed

# Start development server
npm run dev
```

## Environment Variables

```
DATABASE_URL=           # Neon PostgreSQL connection string
DIRECT_URL=             # Direct connection (same as DATABASE_URL for Neon)
NEXTAUTH_SECRET=        # Random string for JWT signing
NEXTAUTH_URL=           # App URL (http://localhost:3000 for dev)
CLOUDINARY_CLOUD_NAME=  # Your Cloudinary cloud name
CLOUDINARY_API_KEY=     # Cloudinary API key
CLOUDINARY_API_SECRET=  # Cloudinary API secret
```
