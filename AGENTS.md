# Agent Context & Guidelines

This document serves as the central context and set of guidelines for any AI agent working on the Printr project. 

## Project Overview
Printr is composed of two main applications:
1. **`backend/`**: A Node.js Express server that handles database interactions, authentication, document processing, and API routes.
2. **`mobile-app/`**: A React Native application built with Expo and Expo Router.

## Guidelines for AI Agents
1. **Understand the Context**: Always review `project_structure.md` to understand where files are located before making structural changes.
2. **Maintain Separation of Concerns**: Keep backend logic out of the mobile app, and ensure the mobile app communicates strictly via the REST API or established backend services.
3. **Database & Migrations**: Ensure that database schema changes are reflected in `backend/schema.sql` and that appropriate migration scripts are created in `backend/`.
4. **Environment Variables**: Never hardcode secrets. Always use environment variables defined in `.env` files (which should remain out of version control).
5. **Typescript & Styling**: For the `mobile-app`, use TypeScript strictly and adhere to the existing UI patterns located in `mobile-app/components/ui/`.

---

## Agent Change Log

**IMPORTANT:** Any AI agent working on this project MUST append a new entry to the `Agent Change Log` below after completing a significant change. Use the following format:
- **Date**: [YYYY-MM-DD]
- **Agent Name**: [Your Name/Identifier]
- **Changes Made**: [Brief summary of the changes made]

### Log
- **Date**: 2026-10-07
- **Agent Name**: Antigravity
- **Changes Made**: Created `project_structure.md` and `AGENTS.md` to establish project documentation and provide context for future agents.
- **Date**: 2026-10-07
- **Agent Name**: Antigravity
- **Changes Made**: Improved UI in home.tsx and print-preferences.tsx for a modern look, fixed text overlapping in print history, added a 3-second long-press modal to view order details, and added a helper text to instruct users.
- **Date**: 2026-10-07
- **Agent Name**: Antigravity
- **Changes Made**: Improved UI in login.tsx to give it a premium card-based layout with refined typography and colors.
- **Date**: 2026-10-07
- **Agent Name**: Antigravity
- **Changes Made**: Improved UI in login.tsx to give it a premium top-aligned layout with refined typography and elegant button shadows.
