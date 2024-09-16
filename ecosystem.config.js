
module.exports = {
  apps: [
    {
      name: "pos",     // Name of your app
      script: "./index.js",        // The entry point of your app
      instances: 1,          // Auto-scale based on CPU cores
      exec_mode: "fork",      // Cluster mode for scaling
      watch: true,               // Watch for file changes (optional)
      env: {
        DATABASE_URL: "postgresql://postgres:1997@127.0.0.1:5432/pos",
        NODE_ENV: "production", 
        PORT: 3000,
        JWT_SECRET: "hsjdhlkjslkdjfkl",
        ACTIVE_TOKEN: "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJzdXBwb3J0SWQiOjUyLCJmdWxsTmFtZSI6IndoYXRzIHVwIGJvdCIsInVzZXJOYW1lIjoiYm90Iiwic2Vzc2lvbklkIjoiNjY4Y2ZhYzAxYzQzOCIsImFwaUxpc3QiOiI2LDcsMTMsMTUsMTYsMTcsMTgsMTksMjAsMjEsMjIsMjMsMjQsMjUsMzAiLCJpbmRleCI6NSwiaWF0IjoxNzIwNTE1MjY0LCJleHAiOjE3NTIwNTEyNjQsInBhZ2VzIjpbMSwzLDRdfQ.AgrZUds_wvCbdBxJAE-CEbHhyTnSy7cM90ECI2kKgZ4",
        COMPANY_TOKEN: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjMiLCJpYXQiOjE3MDUxNDA2MDgsImV4cCI6MTczNjY5ODIwOH0.PuzXYD79ORrV1E8Zgj_EIT57_3VHRHwZIW4OYW0A8jw"
      },
     }
  ],
};
