# ⚖️ Justice Connect
### AI-Powered Access to Justice Assistant
**Understand. Navigate. Get Help.**

## 📌 About the Project

**Justice Connect** is an AI-powered legal assistance and case-tracking web application designed to make legal information and case-related services more accessible, understandable, and user-friendly for ordinary citizens.

Many people face difficulties navigating legal procedures, finding appropriate legal assistance, understanding case updates, and accessing legal information in their preferred language. Justice Connect aims to address these challenges through a centralized digital platform that connects citizens with legal assistance features and simplifies case-related interactions.

The platform provides separate dashboards and role-based access for four types of users: **Citizens, Verified Lawyers, Court Authorities, and Administrators.**

Citizens can submit their legal issues, receive a unique reference number, track case progress, view hearing-related information, and interact with an AI-powered assistant for general legal information. Lawyers and authorized authorities can access relevant case information according to their permissions, while administrators manage platform operations.

The application also supports English and Tamil to improve accessibility for regional-language users.

## 🎯 Problem We Address

Access to legal assistance can be difficult because of:
- Complex legal terminology and procedures.
- Limited awareness of available legal assistance.
- Difficulty tracking case progress and hearing dates.
- Communication and language barriers.
- Lack of a simple centralized platform for basic legal information and case-related activities.

## 💡 Our Approach

Justice Connect brings multiple legal assistance features into one platform. It combines web application development, database management, role-based access control, and AI integration to provide a simpler way for users to access general legal information and manage case-related interactions.

## ✨ Key Features

### 👤 1. Citizen Portal
- User registration and login.
- Submit legal issues through an online form.
- Generate a unique internal case reference number.
- View submitted case details.
- Track case status and progress through a timeline.
- Access lawyer-related services.
- Interact with the AI legal information assistant.

### ⚖️ 2. Verified Lawyer Portal
- Dedicated lawyer dashboard.
- Search for cases using reference numbers.
- Access authorized case information.
- View relevant case details based on access permissions.

### 🏛️ 3. Court Authority Dashboard
- Manage relevant case information.
- Add and update hearing schedules.
- Maintain hearing dates, times, and court details.
- Support case progress updates.

### 🛡️ 4. Admin Dashboard
- Manage users and their roles.
- View and manage case records.
- Support administrative operations.
- Monitor platform activities.

### 🤖 5. AI-Powered Legal Assistant
- Provides AI-generated responses to general legal information questions.
- Helps users understand basic legal concepts and procedures.
- Integrates Google's Gemini API.
- Designed to make legal information easier to understand.

### 🌐 6. Multilingual Interface
- English and Tamil language support.
- Improves accessibility for users who prefer regional-language interfaces.

### 📅 7. Case and Hearing Management
- Unique internal reference number generation.
- Case status tracking.
- Case timeline information.
- Hearing schedule management.

## 👥 User Roles and Responsibilities

| User Role | Main Responsibility |
|---|---|
| Citizen | Submit legal issues and track case progress |
| Verified Lawyer | Access authorized case information |
| Court Authority | Manage relevant case and hearing details |
| Admin | Manage users, cases, and platform operations |

## 🛠️ Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript |
| UI Styling | Tailwind CSS |
| Backend | Node.js, Express.js |
| Database | PostgreSQL |
| ORM | Drizzle ORM |
| AI Integration | Google Gemini API |
| API Communication | REST APIs |
| Authentication | Password Hashing, Token-Based Authentication, RBAC |
| Version Control | Git, GitHub |
| Package Manager | pnpm |

## 🏗️ Application Architecture

Justice Connect follows a full-stack client-server architecture.

**1. Frontend Layer – React + TypeScript**

Provides the user interface, dashboards, forms, case tracking views, and AI assistant interface.

**2. Backend Layer – Node.js + Express.js**

Handles API requests, authentication, authorization, business logic, and communication with external services.

**3. Database Layer – PostgreSQL + Drizzle ORM**

PostgreSQL stores application data, while Drizzle ORM provides a structured way to interact with database tables using TypeScript.

**4. AI Integration – Google Gemini API**

The backend connects with Google's Gemini API to process AI assistant requests and return generated responses to the frontend.

### Basic Application Flow

```text
             USER
               |
               v
       REACT FRONTEND
               |
               v
       EXPRESS REST API
               |
        +------+------+
        |             |
        v             v
   DRIZZLE ORM    GEMINI API
        |
        v
   POSTGRESQL
```

## 🔐 Security and Access Control

- Password hashing to protect stored user credentials.
- Authentication for protected application features.
- Role-Based Access Control (RBAC).
- Permission-based access to relevant case information.
- Environment variables for sensitive configuration such as database credentials and API keys.
- Backend-side validation and authorization.

## 🌍 Project Objective

The objective of Justice Connect is to use modern web technologies and AI to simplify access to legal information and improve the digital experience of people interacting with basic legal assistance and case-related services.

It demonstrates how full-stack development, database technologies, secure access control, and AI integration can be combined to build a socially useful technology solution.

## 🚀 Future Enhancements

- Integration with authorized legal and government services.
- More regional language support.
- Improved AI responses using verified legal information sources.
- Secure document management and processing.
- Notifications for important case and hearing updates.
- Enhanced accessibility and usability testing.

## ⚠️ Disclaimer

Justice Connect is an academic prototype developed for educational and demonstration purposes.

- The platform uses sample/demo data.
- It is not an official government or court application.
- It is not currently integrated with real court databases or government systems.
- Generated reference numbers are internal application identifiers, not official court case numbers.
- AI-generated information is for general informational purposes only and is not a substitute for professional legal advice.

## 👨‍💻 Project Information

- **Project Name:** Justice Connect
- **Domain:** Legal Technology (LegalTech)
- **Project Type:** Full-Stack Web Application
- **AI Service:** Google Gemini API
- **Development Focus:** UI/UX Design, Full-Stack Development, Database Integration, Authentication, and AI Integration

**Built with the goal of making legal information more accessible through technology.**