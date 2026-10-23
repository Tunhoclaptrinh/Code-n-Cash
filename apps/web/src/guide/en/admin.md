# Administration and permissions

Use `sysadmin@codecash.vn` for administration; auditors read and export. Administration is separated from exception review and payment approval.

![Resource tabs, protected-record notice and row actions](../../../public/guide/images/admin-organizations.webp)

## Choose and edit a resource

Tabs cover organizations, users, contract drafts, milestone templates, parameters, documents and administration logs. Switching tabs clears that resource's search/filter state.

Check the origin tag: official Data Pack and workflow-managed records are protected from generic edits. Change business contracts through their dedicated draft, signing, evidence or approval screens.

To add an allowed record, choose **Create**, fill required fields and references, review organization kind and role, then save and verify the new row. Use the edit icon only when enabled; protected records show a view action.

![Create organization form](../../../public/guide/images/admin-create.webp)

## Import resources

![Resource import and preview](../../../public/guide/images/admin-import.webp)

Download the selected resource's template, populate it and preview validation. Correct type and reference errors before importing valid rows. Check the success/failure result afterwards. Resource import differs from Data Pack evaluation upload; each has its own schema and purpose.

## Manage users

![User action menu](../../../public/guide/images/admin-users.webp)

Open **Users**, use edit for permitted fields and the additional-action menu for details or password reset. Review the target before locking an account. Assign the correct organization and minimum necessary role; OPS accounts do not act as buyer payment approvers.

## Read the permission matrix

![Role-to-action matrix](../../../public/guide/images/admin-permissions.webp)

Search modules and compare which roles can view, create, import, export or invoke workflow actions. This matrix displays existing permissions; it does not offer live permission toggles.

> Decision rules and permissions are not editable through this screen. Draft-level penalty parameters flow into milestones. Arbitrary parameter rows do not automatically change the engine. New rule versions or providers require implementation and review.

`MANAGED_RECORD` means the protected record must be handled through its owning workflow. Missing write controls may mean you signed in as auditor. See [Roles](/guide/roles), [Table tools](/guide/tables) and [Exceptions](/guide/exceptions).
