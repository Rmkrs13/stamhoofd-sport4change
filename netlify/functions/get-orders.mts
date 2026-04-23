import type { Context, Config } from "@netlify/functions";

const API_BASE_URL = 'https://5dd7e0c3-b8c7-404c-a83d-4a1e67b77dca.api.stamhoofd.app/v247';
const WEBSHOP_ID = 'b25b18dc-b803-430f-b68b-d2822df19524';

async function getAuthToken(username: string, password: string) {
  const response = await fetch(`${API_BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      grant_type: 'password',
      username: username,
      password: password
    })
  });

  if (!response.ok) {
    throw new Error(`Authentication failed: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function fetchAllOrders(token: string) {
  let allOrders: any[] = [];
  let hasMore = true;
  let afterNumber = null;
  let updatedSince = null;
  
  while (hasMore) {
    const url = new URL(`${API_BASE_URL}/webshop/${WEBSHOP_ID}/orders`);
    if (afterNumber !== null) {
      url.searchParams.append('afterNumber', afterNumber);
    }
    if (updatedSince !== null) {
      url.searchParams.append('updatedSince', updatedSince);
    }
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch orders: ${response.status}`);
    }

    const data = await response.json();
    allOrders = allOrders.concat(data.results || []);
    
    if (data.next) {
      afterNumber = data.next.afterNumber;
      updatedSince = data.next.updatedSince;
    } else {
      hasMore = false;
    }
  }
  
  return allOrders;
}

export default async (req: Request, context: Context) => {
  // Check for CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  // Check for authentication
  const authHeader = req.headers.get('Authorization');
  const appPassword = Netlify.env.get('APP_PASSWORD');
  
  if (!appPassword) {
    console.error('APP_PASSWORD environment variable not set');
    return new Response(JSON.stringify({ 
      error: 'Server configuration error' 
    }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  if (!authHeader || authHeader !== appPassword) {
    return new Response(JSON.stringify({ 
      error: 'Unauthorized' 
    }), { 
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  try {
    const username = Netlify.env.get('STAMHOOFD_USERNAME');
    const password = Netlify.env.get('STAMHOOFD_PASSWORD');
    
    if (!username || !password) {
      return new Response(JSON.stringify({ 
        error: 'Configuration error: Missing credentials' 
      }), { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const token = await getAuthToken(username, password);
    const orders = await fetchAllOrders(token);
    
    return new Response(JSON.stringify({ orders }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error: any) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal server error' 
    }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};

export const config: Config = {
  path: "/api/orders"
};