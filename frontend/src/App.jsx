// frontend/src/App.jsx - With proxy support
import React, { useState, useEffect, useCallback } from 'react';
import RedTeamLogger from './components/RedTeamLogger';
import Login from './components/Login';

// No need for API_URL, we use proxy with relative URLs
// console.log('Using API URL:', API_URL);

// Debug function to help diagnose CSRF and CORS issues
const debugNetworkIssues = async () => {
  try {
    console.log("Debugging network connectivity...");
    
    // Test CSRF token endpoint
    const csrfResponse = await fetch('/api/csrf-token', {
      credentials: 'include',
      headers: {
        'Accept': 'application/json'
      }
    });
    
    console.log("CSRF Token Response:", { 
      status: csrfResponse.status,
      ok: csrfResponse.ok
    });
    
    if (csrfResponse.ok) {
      const csrfData = await csrfResponse.json();
      console.log("CSRF Token received:", !!csrfData.csrfToken);
    }
    
    // Test health check endpoint
    try {
      const healthResponse = await fetch('/api/health', {
        credentials: 'include'
      });
      
      console.log("Health Check Response:", {
        status: healthResponse.status,
        ok: healthResponse.ok
      });
      
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        console.log("Health Check Data:", healthData);
      }
    } catch (healthError) {
      console.log("Health check error:", healthError.message);
    }
    
    // Check if cookies are accessible
    console.log("Cookies:", document.cookie ? "Present" : "None or inaccessible");
    
    console.log("Debug completed");
  } catch (error) {
    console.error("Debug error:", error);
  }
};

// CSRF token refresh interval - 10 minutes (shorter than the 15-minute expiry)
const TOKEN_REFRESH_INTERVAL = 10 * 60 * 1000; 

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [csrfToken, setCsrfToken] = useState(null);
  const [initializationAttempts, setInitializationAttempts] = useState(0);
  const [initError, setInitError] = useState(null);
  const [lastTokenRefresh, setLastTokenRefresh] = useState(Date.now());

  const handleLoginSuccess = (userData) => {
    console.log('Login success, updating user data:', userData);
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
  };

  const handleLogout = async () => {
    try {
      console.log('Attempting logout...');
      const response = await fetch(`/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CSRF-Token': csrfToken
        },
        credentials: 'include',
        body: JSON.stringify({}) // We don't need userId since we're revoking all
      });
      console.log('Logout response:', response.status);
      
      // Clear all application storage
      localStorage.removeItem('user');
      localStorage.removeItem('passwordChangeRequired');
      
      // Clear any other application state
      sessionStorage.clear();
      
      // Force clear any cached auth state
      setUser(null);
      
      // Force reload the page to reset all application state
      window.location.href = '/';
    } catch (error) {
      console.error('Logout failed:', error);
      // Clear storage and reload anyway for safety
      localStorage.clear();
      sessionStorage.clear();
      window.location.href = '/';
    }
  };

  // Fetch CSRF token function - moved to a separate function to enable reuse
  const fetchCsrfToken = useCallback(async () => {
    console.log('Fetching CSRF token...');
    // Use relative URL with proxy
    const csrfEndpoint = `/api/csrf-token`;

    try {
      const fetchOptions = {
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        mode: 'cors',
        cache: 'no-cache',
      };

      const csrfResponse = await fetch(csrfEndpoint, fetchOptions);

      if (!csrfResponse.ok) {
        const errorText = await csrfResponse.text();
        console.error('CSRF response not OK:', {
          status: csrfResponse.status,
          statusText: csrfResponse.statusText,
          errorText
        });
        return null;
      }

      const data = await csrfResponse.json();
      console.log('CSRF token received:', !!data.csrfToken);
      setLastTokenRefresh(Date.now());
      return data.csrfToken;
    } catch (error) {
      console.error('CSRF fetch error:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      return null;
    }
  }, []);

  // Check authentication status and get CSRF token
  const checkAuth = useCallback(async () => {
    console.log(`Starting auth check (attempt ${initializationAttempts + 1})...`);

    try {
      // Fetch CSRF token
      const token = await fetchCsrfToken();
      
      if (!token) {
        setInitError(`Failed to get CSRF token`);
        setInitializationAttempts(prev => prev + 1);
        return;
      }
      
      setCsrfToken(token);

      // Check authentication - use relative URL with proxy
      console.log('Checking authentication...');
      const response = await fetch(`/api/auth/me`, {
        credentials: 'include',
        headers: {
          'CSRF-Token': token
        }
      });

      console.log('Auth check response:', {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText
      });

      if (response.ok) {
        const userData = await response.json();
        console.log('Auth check successful:', userData);
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
      } else {
        const errorData = await response.json();
        console.log('Auth check failed:', errorData);
        
        if (errorData.requiresPasswordChange) {
          setUser(null);
          localStorage.setItem('passwordChangeRequired', JSON.stringify({
            username: errorData.username,
            role: errorData.role
          }));
        } else {
          localStorage.removeItem('user');
          localStorage.removeItem('passwordChangeRequired');
          setUser(null);
        }
      }
    } catch (error) {
      console.error('Auth check failed:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      setInitError(`Connection error: ${error.message}`);
      localStorage.removeItem('user');
      localStorage.removeItem('passwordChangeRequired');
      setInitializationAttempts(prev => prev + 1);
    } finally {
      setLoading(false);
    }
  }, [initializationAttempts, fetchCsrfToken]);

  // CSRF token refresh function
  const refreshCsrfToken = useCallback(async () => {
    try {
      console.log("Refreshing CSRF token...");
      const token = await fetchCsrfToken();
      if (token) {
        console.log("CSRF token refreshed successfully");
        setCsrfToken(token);
        window.csrfToken = token; // Update the global token as well
      } else {
        console.error("Failed to refresh CSRF token");
      }
    } catch (error) {
      console.error("Error refreshing CSRF token:", error);
    }
  }, [fetchCsrfToken]);

  // Initial auth check
  useEffect(() => {
    // If we don't have a CSRF token yet and haven't exceeded retry attempts, try again
    if (!csrfToken && initializationAttempts < 3) {
      console.log(`Scheduling auth check (attempt ${initializationAttempts + 1} of 3)...`);
      const timeoutId = setTimeout(() => {
        // Add the debug call here to diagnose issues
        debugNetworkIssues();
        checkAuth();
      }, initializationAttempts * 1000); // Exponential backoff

      return () => {
        console.log('Cleaning up timeout...');
        clearTimeout(timeoutId);
      };
    }
  }, [csrfToken, initializationAttempts, checkAuth]);

  // Set up token refresh interval
  useEffect(() => {
    if (!csrfToken) return;

    console.log("Setting up CSRF token refresh interval...");
    const intervalId = setInterval(() => {
      refreshCsrfToken();
    }, TOKEN_REFRESH_INTERVAL);

    return () => {
      console.log("Clearing CSRF token refresh interval");
      clearInterval(intervalId);
    };
  }, [csrfToken, refreshCsrfToken]);

  // Add event listener for user activity to refresh token
  useEffect(() => {
    const handleUserActivity = () => {
      // Only refresh if the token is older than 5 minutes
      if (Date.now() - lastTokenRefresh > 5 * 60 * 1000) {
        refreshCsrfToken();
      }
    };

    // Add event listeners for mouse and keyboard activity
    window.addEventListener('mousedown', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('touchstart', handleUserActivity);
    
    // Add event listener for visibility change (tab becomes active again)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        handleUserActivity();
      }
    });

    return () => {
      window.removeEventListener('mousedown', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('touchstart', handleUserActivity);
      document.removeEventListener('visibilitychange', handleUserActivity);
    };
  }, [lastTokenRefresh, refreshCsrfToken]);

  // Show loading state with retry button if needed
  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
        <div className="mb-4 text-xl">Initializing Application</div>
        <div className="text-sm text-gray-400">Establishing secure connection...</div>
        <div className="mt-2 text-xs text-gray-500">Attempt {initializationAttempts + 1} of 3</div>
      </div>
    );
  }

  // Add retry button if initialization failed
  if (!csrfToken && initializationAttempts >= 3) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white">
        <div className="mb-4 text-xl">Connection Error</div>
        <div className="text-sm text-gray-400 mb-4">Failed to initialize security</div>
        {initError && (
          <div className="text-red-400 text-sm mb-4">
            Error details: {initError}
          </div>
        )}
        <button
          onClick={() => {
            console.log('Retrying connection...');
            setInitializationAttempts(0);
            setLoading(true);
            setInitError(null);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900">
      {user ? (
        <div>
          <div className="bg-gray-800 shadow">
            <div className="w-full px-2 sm:px-4 py-4">
              <div className="flex justify-between items-center">
                <h1 className="text-xl font-semibold text-white">Clio Logging Platform</h1>
                <div className="flex items-center gap-4">
                  <span className="text-gray-300">Welcome, {user.username}</span>
                  {user.role === 'admin' && (
                    <span className="bg-red-900 text-red-200 text-xs font-medium px-2.5 py-0.5 rounded">
                      Admin
                    </span>
                  )}
                  <button
                    onClick={handleLogout}
                    className="px-4 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600"
                  >
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="py-4 max-w-full overflow-hidden">
            <RedTeamLogger 
              currentUser={user}
              csrfToken={csrfToken}
            />
          </div>
        </div>
      ) : (
        <Login 
          onLoginSuccess={handleLoginSuccess}
          csrfToken={csrfToken}
        />
      )}
    </div>
  );
}

export default App;