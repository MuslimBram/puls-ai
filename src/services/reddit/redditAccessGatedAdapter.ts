/**
 * PULSE AI — REDDIT ACCESS-GATED ADAPTER (PHASE R2)
 *
 * Implements access-gated adapter for Reddit SaaS integration.
 * FAILS CLOSED with REDDIT_ACCESS_NOT_CONFIGURED unless commercial access is explicitly READY.
 * ZERO network requests occur when access status is NOT_CONFIGURED or COMMERCIAL_ACCESS_REQUIRED.
 */

import {
  RedditAccessStatus,
  RedditAdapterResult,
  RedditPostOptions,
  RedditReplyOptions,
  RedditSyncOptions,
  RedditWorkspaceConfig,
} from "../../types/redditIntegration";

export class RedditAccessGatedAdapter {
  private config: RedditWorkspaceConfig;

  constructor(config: RedditWorkspaceConfig) {
    this.config = config;
  }

  public getAccessStatus(): RedditAccessStatus {
    return this.config.access_status ?? "COMMERCIAL_ACCESS_REQUIRED";
  }

  /**
   * Syncs Reddit inbox messages for workspace.
   * Fails closed with REDDIT_ACCESS_NOT_CONFIGURED unless access_status === 'READY'.
   */
  public async syncRedditInbox(
    options: RedditSyncOptions
  ): Promise<RedditAdapterResult<unknown[]>> {
    this.assertWorkspaceMatch(options.workspace_id);

    if (this.getAccessStatus() !== "READY") {
      return {
        success: false,
        access_status: this.getAccessStatus(),
        error_code: "REDDIT_ACCESS_NOT_CONFIGURED",
        error_message:
          "Commercial Reddit API access is not configured for this workspace. Live API calls are disabled.",
        data: [],
      };
    }

    // Live call blocked until commercial access approved
    return {
      success: true,
      access_status: "READY",
      data: [],
    };
  }

  /**
   * Syncs subreddit activity for workspace.
   * Fails closed with REDDIT_ACCESS_NOT_CONFIGURED unless access_status === 'READY'.
   */
  public async syncSubredditActivity(
    options: RedditSyncOptions
  ): Promise<RedditAdapterResult<unknown[]>> {
    this.assertWorkspaceMatch(options.workspace_id);

    if (this.getAccessStatus() !== "READY") {
      return {
        success: false,
        access_status: this.getAccessStatus(),
        error_code: "REDDIT_ACCESS_NOT_CONFIGURED",
        error_message:
          "Commercial Reddit API access is not configured for this workspace. Subreddit activity sync is disabled.",
        data: [],
      };
    }

    return {
      success: true,
      access_status: "READY",
      data: [],
    };
  }

  /**
   * Submits a Reddit post.
   * Fails closed with REDDIT_ACCESS_NOT_CONFIGURED unless access_status === 'READY'.
   */
  public async sendRedditPost(
    options: RedditPostOptions
  ): Promise<RedditAdapterResult<Record<string, unknown>>> {
    this.assertWorkspaceMatch(options.workspace_id);

    if (this.getAccessStatus() !== "READY") {
      return {
        success: false,
        access_status: this.getAccessStatus(),
        error_code: "REDDIT_ACCESS_NOT_CONFIGURED",
        error_message:
          "Commercial Reddit API access is not configured for this workspace. Outbound Reddit post creation is disabled.",
      };
    }

    return {
      success: true,
      access_status: "READY",
      data: { post_id: "t3_mock" },
    };
  }

  /**
   * Submits a reply to a Reddit post or comment.
   * Fails closed with REDDIT_ACCESS_NOT_CONFIGURED unless access_status === 'READY'.
   */
  public async sendRedditReply(
    options: RedditReplyOptions
  ): Promise<RedditAdapterResult<Record<string, unknown>>> {
    this.assertWorkspaceMatch(options.workspace_id);

    if (this.getAccessStatus() !== "READY") {
      return {
        success: false,
        access_status: this.getAccessStatus(),
        error_code: "REDDIT_ACCESS_NOT_CONFIGURED",
        error_message:
          "Commercial Reddit API access is not configured for this workspace. Outbound Reddit reply submission is disabled.",
      };
    }

    return {
      success: true,
      access_status: "READY",
      data: { comment_id: "t1_mock" },
    };
  }

  private assertWorkspaceMatch(targetWorkspaceId: string): void {
    if (this.config.workspace_id !== targetWorkspaceId) {
      throw new Error(
        `Workspace isolation error: Config workspace (${this.config.workspace_id}) does not match target (${targetWorkspaceId})`
      );
    }
  }
}
