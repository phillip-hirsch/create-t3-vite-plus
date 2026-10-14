import Constants from "expo-constants";

/**
 * Extend this function when going to production by
 * setting the baseUrl to your production API URL.
 */
export const getBaseUrl = () => {
  /**
   * Gets the IP address of your host-machine. If it cannot automatically find it,
   * you'll have to manually set it. The port is the web app's local port, which
   * `WEB_APP_PORT` in the root `.env` sets (3000 by default).
   *
   * **NOTE**: This is only for development. In production, you'll want to set the
   * baseUrl to your production API URL.
   */
  const debuggerHost = Constants.expoConfig?.hostUri;
  const localhost = debuggerHost?.split(":")[0];

  if (!localhost) {
    // return "https://your-web-app.example.com";
    throw new Error(
      "Failed to get localhost. Please point to your production server.",
    );
  }
  // `app.config.ts` sets it from WEB_APP_PORT.
  const port = Constants.expoConfig?.extra?.webAppPort as number;
  return `http://${localhost}:${port}`;
};
