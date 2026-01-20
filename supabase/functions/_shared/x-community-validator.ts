/**
 * X Community Existence Validator
 * Detects when X Communities have been deleted by their owners
 */

export interface CommunityExistenceResult {
  exists: boolean;
  isDeleted: boolean;
  httpStatus?: number;
  errorMessage?: string;
  memberCount?: number;
  checkedAt: string;
}

/**
 * Check if an X Community exists via direct web request
 * Returns 404 if community is deleted
 */
async function checkCommunityViaWeb(communityId: string): Promise<CommunityExistenceResult> {
  const checkedAt = new Date().toISOString();
  
  try {
    const url = `https://x.com/i/communities/${communityId}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    // 404 = Community deleted
    if (response.status === 404) {
      return {
        exists: false,
        isDeleted: true,
        httpStatus: 404,
        errorMessage: 'Community page not found (404)',
        checkedAt,
      };
    }
    
    // 200/302 = Community exists (might be private)
    if (response.status === 200 || response.status === 302 || response.status === 301) {
      return {
        exists: true,
        isDeleted: false,
        httpStatus: response.status,
        checkedAt,
      };
    }
    
    // Other status codes - treat as unknown but assume exists
    return {
      exists: true,
      isDeleted: false,
      httpStatus: response.status,
      errorMessage: `Unexpected status: ${response.status}`,
      checkedAt,
    };
  } catch (error) {
    // Network errors - assume community exists to avoid false positives
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn(`[X Community Validator] Web check failed for ${communityId}:`, errorMsg);
    
    return {
      exists: true,
      isDeleted: false,
      errorMessage: `Web check failed: ${errorMsg}`,
      checkedAt,
    };
  }
}

/**
 * Interpret Apify scrape results
 * Empty members array might indicate deletion or private community
 */
export function interpretApifyResult(members: any[]): CommunityExistenceResult {
  const checkedAt = new Date().toISOString();
  
  if (!members || members.length === 0) {
    return {
      exists: false,
      isDeleted: false, // Not confirmed deleted yet
      memberCount: 0,
      errorMessage: 'No members returned from Apify scrape',
      checkedAt,
    };
  }
  
  return {
    exists: true,
    isDeleted: false,
    memberCount: members.length,
    checkedAt,
  };
}

/**
 * Combined validation with multiple signals
 * Only marks as deleted if we have strong evidence (404 from X.com)
 */
export async function validateCommunityExists(
  communityId: string,
  apifyMembers: any[] = []
): Promise<CommunityExistenceResult> {
  const checkedAt = new Date().toISOString();
  
  // If Apify returned members, community definitely exists
  if (apifyMembers && apifyMembers.length > 0) {
    return {
      exists: true,
      isDeleted: false,
      memberCount: apifyMembers.length,
      checkedAt,
    };
  }
  
  // Apify returned nothing - do secondary web check
  console.log(`[X Community Validator] Apify empty for ${communityId}, checking web...`);
  const webCheck = await checkCommunityViaWeb(communityId);
  
  if (webCheck.httpStatus === 404) {
    console.warn(`[X Community Validator] Community ${communityId} confirmed DELETED (404)`);
    return {
      exists: false,
      isDeleted: true,
      httpStatus: 404,
      errorMessage: 'Community deleted by owner',
      checkedAt,
    };
  }
  
  // Could be private, rate-limited, or temporarily unavailable
  // Don't mark as deleted without strong evidence
  return {
    exists: true,
    isDeleted: false,
    httpStatus: webCheck.httpStatus,
    errorMessage: webCheck.errorMessage || 'Unable to verify, assumed active',
    checkedAt,
  };
}

/**
 * Quick existence check without Apify
 * Used during social refresh to validate communities
 */
export async function quickCommunityCheck(communityId: string): Promise<CommunityExistenceResult> {
  return await checkCommunityViaWeb(communityId);
}
