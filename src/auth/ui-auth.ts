import { expect, type Page } from '@playwright/test';
import type { TestIdentity } from '../config/environment';

export class UiAuth {
  constructor(private readonly page: Page) {}

  async signIn(identity: TestIdentity): Promise<void> {
    await this.page.goto('/login');
    await this.page.getByLabel('Email', { exact: true }).fill(identity.email);
    await this.page.getByLabel('Password', { exact: true }).fill(identity.password);
    await this.page.getByRole('button', { name: 'Sign In' }).click();
    await expect(
      this.page.getByRole('heading', { name: 'Discover & Book Amazing Events' }),
    ).toBeVisible();
  }

  async signOut(): Promise<void> {
    const signOutButton = this.page.getByRole('button', {
      name: /^(log out|logout|sign out)$/i,
    });
    const signOutLink = this.page.getByRole('link', {
      name: /^(log out|logout|sign out)$/i,
    });

    if (await signOutButton.count() === 1) {
      await signOutButton.click();
    } else if (await signOutLink.count() === 1) {
      await signOutLink.click();
    } else {
      throw new Error('Could not find a unique visible sign-out control.');
    }

    await expect(this.page.getByLabel('Email', { exact: true })).toBeVisible();
  }
}
