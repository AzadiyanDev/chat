import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Wait for initial auth check if still loading
  if (auth.isLoading()) {
    await auth.initialize();
  }

  if (auth.isAuthenticated()) {
    return true;
  }

  router.navigate(['/auth/login']);
  return false;
};

export const guestGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoading()) {
    await auth.initialize();
  }

  if (!auth.isAuthenticated()) {
    return true;
  }

  router.navigate(['/']);
  return false;
};
