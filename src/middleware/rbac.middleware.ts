import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticationError } from '../types/index.js';

/**
 * User roles hierarchy
 */
export enum UserRole {
  STUDENT = 'STUDENT',
  COACH = 'COACH',
  VOLUNTEER = 'VOLUNTEER',
  SCHOOL_ADMIN = 'SCHOOL_ADMIN',
  REGIONAL_ADMIN = 'REGIONAL_ADMIN',
  NATIONAL_ADMIN = 'NATIONAL_ADMIN',
}

/**
 * Role hierarchy levels (higher number = more permissions)
 */
const roleHierarchy: Record<string, number> = {
  [UserRole.STUDENT]: 1,
  [UserRole.VOLUNTEER]: 2,
  [UserRole.COACH]: 3,
  [UserRole.SCHOOL_ADMIN]: 4,
  [UserRole.REGIONAL_ADMIN]: 5,
  [UserRole.NATIONAL_ADMIN]: 6,
};

/**
 * Check if user has required role
 */
export const hasRole = (userRole: string, requiredRole: string): boolean => {
  const userLevel = roleHierarchy[userRole] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 999;
  return userLevel >= requiredLevel;
};

/**
 * Middleware to require specific roles
 */
export const requireRole = (allowedRoles: string[]) => {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;

    if (!user) {
      throw new AuthenticationError('Authentication required');
    }

    const hasPermission = allowedRoles.some((role) => hasRole(user.role, role));

    if (!hasPermission) {
      reply.code(403).send({
        error: 'Authorization Error',
        message: 'Insufficient permissions',
      });
      return;
    }
  };
};

/**
 * Check if user can access resource owned by another user
 */
export const canAccessUserResource = (
  currentUserId: string,
  resourceOwnerId: string,
  currentUserRole: string,
): boolean => {
  // User can access their own resources
  if (currentUserId === resourceOwnerId) {
    return true;
  }

  // Admins can access any resource
  if (
    currentUserRole === UserRole.NATIONAL_ADMIN ||
    currentUserRole === UserRole.REGIONAL_ADMIN ||
    currentUserRole === UserRole.SCHOOL_ADMIN
  ) {
    return true;
  }

  return false;
};

/**
 * Permission matrix for different operations
 */
export const permissions = {
  // User management
  createUser: [UserRole.SCHOOL_ADMIN, UserRole.REGIONAL_ADMIN, UserRole.NATIONAL_ADMIN],
  updateUser: [UserRole.COACH, UserRole.SCHOOL_ADMIN, UserRole.REGIONAL_ADMIN, UserRole.NATIONAL_ADMIN],
  deleteUser: [UserRole.NATIONAL_ADMIN],

  // Game management
  createGame: [UserRole.STUDENT, UserRole.COACH, UserRole.SCHOOL_ADMIN],
  viewGame: [UserRole.STUDENT, UserRole.COACH, UserRole.VOLUNTEER, UserRole.SCHOOL_ADMIN],

  // Tournament management
  createTournament: [UserRole.COACH, UserRole.SCHOOL_ADMIN, UserRole.REGIONAL_ADMIN],
  manageTournament: [UserRole.SCHOOL_ADMIN, UserRole.REGIONAL_ADMIN, UserRole.NATIONAL_ADMIN],

  // School management
  manageSchool: [UserRole.SCHOOL_ADMIN, UserRole.REGIONAL_ADMIN, UserRole.NATIONAL_ADMIN],
};
