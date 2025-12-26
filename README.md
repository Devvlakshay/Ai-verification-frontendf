# 🚀 AI-Powered Identity Verification Frontend

<p align="center">
  <img src="public/globe.svg" alt="Project Logo" width="120">
</p>

<p align="center">
  A modern, secure, and user-friendly frontend for an AI-powered identity verification system. This application is built with Next.js and Tailwind CSS, providing a seamless experience for users to verify their identity using their documents and a selfie.
</p>

---

## 🌟 Features

- **Seamless Mobile Hand-off**: Initiates the verification process from a mobile app using a secure JWT token, providing a smooth user experience.
- **AI-Powered Verification**: Leverages cutting-edge AI to perform facial recognition and verify identity documents.
- **Intuitive User Flow**: A multi-step process guides the user through each stage of verification, from selfie capture to document submission.
- **Camera Integration**: Utilizes the device's camera to capture high-quality images for the verification process.
- **Client-Side State Management**: Employs a simple and effective state management solution using React hooks and context.
- **Robust Error Handling**: Provides clear feedback to the user in case of errors, such as missing tokens or invalid data.
- **Responsive Design**: Fully responsive and built with Tailwind CSS, ensuring a consistent experience across all devices.

---

## 🔧 How It Works

The application is designed to work as a "handoff" from another application, typically a mobile app.

1.  **Initiation**: The user starts the verification process in a mobile app, which generates a JWT containing their essential data (`user_id`, `name`, `dob`, `gender`).
2.  **Redirection**: The mobile app redirects the user to this web application, passing the JWT as a `token` in the URL query parameters.
3.  **Token Validation**: The frontend captures the token, decodes it client-side, and validates its contents.
4.  **State Hydration**: The user's data is extracted from the token and used to hydrate the application's state, which is managed by a custom hook (`useVerificationStore`).
5.  **Verification Flow**: The user is then automatically guided to the first step of the verification process, the selfie capture.
6.  **Data Persistence**: All captured images and user data are persisted in the browser's IndexedDB, ensuring data is not lost between steps. The data is cleared automatically on a full page reload to ensure a fresh start for each session.
7.  **API Submission**: Once all the necessary data is collected, it is sent to a backend API for final verification.

---

## 📂 Project Structure

```
/home/lakshya/Desktop/ai-verification-frontend
├── .gitignore
├── next.config.ts
├── package.json
├── README.md
├── tsconfig.json
├── public/
│   ├── globe.svg
│   └── ...
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── page.tsx
    │   ├── globals.css
    │   ├── api/
    │   │   └── submit-verification/
    │   │       └── route.ts
    │   └── verify/
    │       ├── layout.tsx
    │       ├── details/
    │       ├── selfie/
    │       ├── front/
    │       ├── back/
    │       └── result/
    ├── components/
    │   ├── CameraCapture.tsx
    │   ├── FileUpload.tsx
    │   ├── StoreResetter.tsx
    │   └── VerificationStore.ts
    └── lib/
        ├── db.ts
        └── utils.ts
```

### Key Directory Explanations

- **`src/app`**: The main application folder for Next.js, using the App Router.
  - **`api`**: Contains backend API routes.
  - **`verify`**: Contains the different pages/steps for the verification flow.
- **`src/components`**: Contains all the reusable React components.
  - **`VerificationStore.ts`**: The custom hook for managing the application's state.
- **`src/lib`**: Contains library code and utilities.
  - **`db.ts`**: A wrapper for interacting with IndexedDB.

---

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

- [Node.js](https://nodejs.org/en/) (version 20 or higher recommended)
- [npm](https://www.npmjs.com/)

### Installation

1.  **Clone the repository**
    ```sh
    git clone https://github.com/your-username/ai-verification-frontend.git
    ```
2.  **Navigate to the project directory**
    ```sh
    cd ai-verification-frontend
    ```
3.  **Install dependencies**
    ```sh
    npm install
    ```

### Running the Application

1.  **Start the development server**
    ```sh
    npm run dev
    ```
2.  **Open the application**
    Open [http://localhost:3000](http://localhost:3000) in your browser to see the running application.

---

## Usage

To use the application in its intended way, you need to simulate the mobile hand-off.

1.  Start the development server (`npm run dev`).
2.  Create a mock JWT token with the required payload:
    ```json
    {
      "user_id": "12345",
      "name": "John Doe",
      "dob": "1990-01-01",
      "gender": "Male"
    }
    ```
    You can use a site like [jwt.io](https://jwt.io/) to create a token.
3.  Append the token to the URL:
    `http://localhost:3000/?token=<your-jwt-token>`
4.  The application will then start the verification flow automatically.

---

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

---

## 📜 License

Distributed under the MIT License. See `LICENSE` for more information.

---

## 📬 Contact

Your Name - [@your_twitter](https://twitter.com/your_twitter) - email@example.com

Project Link: [https://github.com/your-username/ai-verification-frontend](https://github.com/your-username/ai-verification-frontend)
