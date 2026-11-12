import { ROLES } from '../../utils/constants';
import { userHasRole } from '../../utils/roles';

/** Staff accounts read and moderate; they do not publish posts or listings. */
export const isStaffUser = (user) => userHasRole(user, ROLES.ADMIN, ROLES.FINANCE, ROLES.SUPER_ADMIN);
