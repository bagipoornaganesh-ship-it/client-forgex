# Security Specification for Forge Protocol

## 1. Data Invariants
- A lead must have a valid email and a source.
- Leads are immutable after creation (creation only, no read/update/delete for public).
- Chat sessions are identified by a `userId`. Users can only access and update their own chat session.
- `messages` in chat sessions is a list that can be appended to.

## 2. The "Dirty Dozen" Payloads

1. **Identity Spoofing (Leads)**: Attempt to read all leads.
2. **Identity Spoofing (Chat)**: Attempt to read someone else's chat session via ID guessing.
3. **Identity Spoofing (Chat)**: Attempt to create a chat session with someone else's `userId`.
4. **State Shortcutting**: Attempt to update a lead's email after creation.
5. **Resource Poisoning**: Inject 1MB string into lead email field.
6. **Resource Poisoning**: Use a path variable that is too long as a document ID.
7. **Type Mismatch**: Send an object instead of an array for `messages`.
8. **Missing Fields**: Create a lead without `source`.
9. **Timestamp Manipulation**: Set `createdAt` to a future date manually.
10. **Unauthorized Delete**: Attempt to delete a lead.
11. **Unauthorized List**: Attempt to list all support chats.
12. **Massive List**: Attempt to create a chat session with 50,000 messages at once.

## 3. Test Runner (Draft)
The tests will verify that:
- `create` on `/leads` succeeds with valid data.
- `get/list/update/delete` on `/leads` fails.
- `create` on `/support_chats/{chatId}` succeeds if `incoming().userId` matches the requester's context.
- `update` on `/support_chats/{chatId}` only allows appending to messages or updating `updatedAt`.
