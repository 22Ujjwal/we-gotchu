# Keep service integrations independent

Tony requires a modular and extensible design while delivering one happy-path demo first.
Tony additionally requires a shared contract so the four teammates and their agents can work without conflicting implementations or overlapping file edits.
Wayfinding must settle shared data shapes, operations, status and error meanings, ownership, and the process for changing a shared contract before implementation work is divided.
This records the requirement, not a completed or approved contract.
Keep event requirements, plan selection, approvals, and the event's overall progress independent of any supplier or invitation service.
Venue reservations, item purchases, payment and refund handling, and optional guest management should have distinct responsibilities.
Provider-specific integration code should translate between each service's operations and our event workflow.
Use the smallest boundaries needed for the demo rather than building a general integration framework.

Adding Luma or another guest-management provider must not require replacing the venue booking or purchasing workflow.
Approval must describe the actual actions regardless of which provider executes them.
Canceling a guest-facing event page is a separate action from canceling a venue reservation or item purchase.
The event-level cancellation coordinates the relevant actions and records each result.
Guest notification and recipient approval rules must be agreed before invitation sending is enabled.

This requires some separation during the initial build, but keeps later service additions from spreading provider-specific assumptions through the entire product.
No language, framework, deployment platform, or provider implementation is selected by this decision.
