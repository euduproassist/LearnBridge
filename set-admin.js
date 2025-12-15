Admin Portal Initializing for UID: hwNv2k636LMjPUfkjJLSpung77t1
webchannel_connection.ts:169 
 
 POST https://firestore.googleapis.com/v1/projects/learnbridge-c600a/databases/(default)/documents:runAggregationQuery 400 (Bad Request)
(anonymous)	@	webchannel_connection.ts:169
Lo	@	webchannel_connection.ts:79
Oo	@	rest_connection.ts:34
ko	@	rest_connection.ts:155
(anonymous)	@	datastore.ts:150
Promise.then		
ko	@	datastore.ts:146
__PRIVATE_invokeRunAggregationQueryRpc	@	datastore.ts:282
(anonymous)	@	aggregate.ts:133
await in (anonymous)		
(anonymous)	@	async_queue_impl.ts:138
(anonymous)	@	async_queue_impl.ts:330
Promise.then		
yu	@	async_queue_impl.ts:189
enqueue	@	async_queue_impl.ts:136
enqueueAndForget	@	async_queue_impl.ts:97
__PRIVATE_firestoreClientRunAggregateQuery	@	firestore_client.ts:541
getAggregateFromServer	@	aggregate.ts:149
getCountFromServer	@	aggregate.ts:111
loadDashboardMetrics	@	admin-portal.js:307
await in loadDashboardMetrics		
initAdminPortal	@	admin-portal.js:169
await in initAdminPortal		
(anonymous)	@	admin-portal.js:134
(anonymous)	@	auth_impl.ts:744
Promise.then		
registerStateListener	@	auth_impl.ts:744
onAuthStateChanged	@	auth_impl.ts:545
onAuthStateChanged	@	index.ts:211
(anonymous)	@	admin-portal.js:125
[NEW] Explain Console errors by using Copilot in Edge: click 
 to explain an error. Learn more
Don't show again
logger.ts:117 
 [2025-12-15T00:40:32.180Z]  @firebase/firestore: Firestore (11.2.0): RestConnection RPC 'RunAggregationQuery' 0x5694c061 failed with error:  {"code":"failed-precondition","name":"FirebaseError"} url:  https://firestore.googleapis.com/v1/projects/learnbridge-c600a/databases/(default)/documents:runAggregationQuery request: {"structuredAggregationQuery":{"aggregations":[{"alias":"aggregate_0","count":{}}],"structuredQuery":{"from":[{"collectionId":"sessions"}],"where":{"compositeFilter":{"op":"AND","filters":[{"fieldFilter":{"field":{"fieldPath":"datetime"},"op":"GREATER_THAN_OR_EQUAL","value":{"timestampValue":"2025-12-14T22:00:00.000000000Z"}}},{"fieldFilter":{"field":{"fieldPath":"datetime"},"op":"LESS_THAN","value":{"timestampValue":"2025-12-15T21:59:59.999000000Z"}}},{"fieldFilter":{"field":{"fieldPath":"status"},"op":"IN","value":{"arrayValue":{"values":[{"stringValue":"approved"},{"stringValue":"in-progress"}]}}}}]}}}}}
defaultLogHandler	@	logger.ts:117
warn	@	logger.ts:209
__PRIVATE_logWarn	@	log.ts:76
(anonymous)	@	rest_connection.ts:109
Promise.then		
Oo	@	rest_connection.ts:34
ko	@	rest_connection.ts:155
(anonymous)	@	datastore.ts:150
Promise.then		
ko	@	datastore.ts:146
__PRIVATE_invokeRunAggregationQueryRpc	@	datastore.ts:282
(anonymous)	@	aggregate.ts:133
await in (anonymous)		
(anonymous)	@	async_queue_impl.ts:138
(anonymous)	@	async_queue_impl.ts:330
Promise.then		
yu	@	async_queue_impl.ts:189
enqueue	@	async_queue_impl.ts:136
enqueueAndForget	@	async_queue_impl.ts:97
__PRIVATE_firestoreClientRunAggregateQuery	@	firestore_client.ts:541
getAggregateFromServer	@	aggregate.ts:149
getCountFromServer	@	aggregate.ts:111
loadDashboardMetrics	@	admin-portal.js:307
await in loadDashboardMetrics		
initAdminPortal	@	admin-portal.js:169
await in initAdminPortal		
(anonymous)	@	admin-portal.js:134
(anonymous)	@	auth_impl.ts:744
Promise.then		
registerStateListener	@	auth_impl.ts:744
onAuthStateChanged	@	auth_impl.ts:545
onAuthStateChanged	@	index.ts:211
(anonymous)	@	admin-portal.js:125
admin-portal.js:350 
 loadDashboardMetrics failed FirebaseError: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/learnbridge-c600a/firestor…lvbnMvaW5kZXhlcy9fEAEaCgoGc3RhdHVzEAEaDAoIZGF0ZXRpbWUQARoMCghfX25hbWVfXxAB
loadDashboardMetrics	@	admin-portal.js:350
await in loadDashboardMetrics		
initAdminPortal	@	admin-portal.js:169
await in initAdminPortal		
(anonymous)	@	admin-portal.js:134
(anonymous)	@	auth_impl.ts:744
Promise.then		
registerStateListener	@	auth_impl.ts:744
onAuthStateChanged	@	auth_impl.ts:545
onAuthStateChanged	@	index.ts:211
(anonymous)	@	admin-portal.js:125
webchannel_connection.ts:169 
 
 POST https://firestore.googleapis.com/v1/projects/learnbridge-c600a/databases/(default)/documents:runAggregationQuery 400 (Bad Request)
(anonymous)	@	webchannel_connection.ts:169
Lo	@	webchannel_connection.ts:79
Oo	@	rest_connection.ts:34
ko	@	rest_connection.ts:155
(anonymous)	@	datastore.ts:150
Promise.then		
ko	@	datastore.ts:146
__PRIVATE_invokeRunAggregationQueryRpc	@	datastore.ts:282
(anonymous)	@	aggregate.ts:133
await in (anonymous)		
(anonymous)	@	async_queue_impl.ts:138
(anonymous)	@	async_queue_impl.ts:330
Promise.then		
yu	@	async_queue_impl.ts:189
enqueue	@	async_queue_impl.ts:136
enqueueAndForget	@	async_queue_impl.ts:97
__PRIVATE_firestoreClientRunAggregateQuery	@	firestore_client.ts:541
getAggregateFromServer	@	aggregate.ts:149
getCountFromServer	@	aggregate.ts:111
loadDashboardMetrics	@	admin-portal.js:307
await in loadDashboardMetrics		
showSection	@	admin-portal.js:86
initAdminPortal	@	admin-portal.js:173
await in initAdminPortal		
(anonymous)	@	admin-portal.js:134
(anonymous)	@	auth_impl.ts:744
Promise.then		
registerStateListener	@	auth_impl.ts:744
onAuthStateChanged	@	auth_impl.ts:545
onAuthStateChanged	@	index.ts:211
(anonymous)	@	admin-portal.js:125
logger.ts:117 
 [2025-12-15T00:40:32.515Z]  @firebase/firestore: Firestore (11.2.0): RestConnection RPC 'RunAggregationQuery' 0x5694c06f failed with error:  {"code":"failed-precondition","name":"FirebaseError"} url:  https://firestore.googleapis.com/v1/projects/learnbridge-c600a/databases/(default)/documents:runAggregationQuery request: {"structuredAggregationQuery":{"aggregations":[{"alias":"aggregate_0","count":{}}],"structuredQuery":{"from":[{"collectionId":"sessions"}],"where":{"compositeFilter":{"op":"AND","filters":[{"fieldFilter":{"field":{"fieldPath":"datetime"},"op":"GREATER_THAN_OR_EQUAL","value":{"timestampValue":"2025-12-14T22:00:00.000000000Z"}}},{"fieldFilter":{"field":{"fieldPath":"datetime"},"op":"LESS_THAN","value":{"timestampValue":"2025-12-15T21:59:59.999000000Z"}}},{"fieldFilter":{"field":{"fieldPath":"status"},"op":"IN","value":{"arrayValue":{"values":[{"stringValue":"approved"},{"stringValue":"in-progress"}]}}}}]}}}}}
defaultLogHandler	@	logger.ts:117
warn	@	logger.ts:209
__PRIVATE_logWarn	@	log.ts:76
(anonymous)	@	rest_connection.ts:109
Promise.then		
Oo	@	rest_connection.ts:34
ko	@	rest_connection.ts:155
(anonymous)	@	datastore.ts:150
Promise.then		
ko	@	datastore.ts:146
__PRIVATE_invokeRunAggregationQueryRpc	@	datastore.ts:282
(anonymous)	@	aggregate.ts:133
await in (anonymous)		
(anonymous)	@	async_queue_impl.ts:138
(anonymous)	@	async_queue_impl.ts:330
Promise.then		
yu	@	async_queue_impl.ts:189
enqueue	@	async_queue_impl.ts:136
enqueueAndForget	@	async_queue_impl.ts:97
__PRIVATE_firestoreClientRunAggregateQuery	@	firestore_client.ts:541
getAggregateFromServer	@	aggregate.ts:149
getCountFromServer	@	aggregate.ts:111
loadDashboardMetrics	@	admin-portal.js:307
await in loadDashboardMetrics		
showSection	@	admin-portal.js:86
initAdminPortal	@	admin-portal.js:173
await in initAdminPortal		
(anonymous)	@	admin-portal.js:134
(anonymous)	@	auth_impl.ts:744
Promise.then		
registerStateListener	@	auth_impl.ts:744
onAuthStateChanged	@	auth_impl.ts:545
onAuthStateChanged	@	index.ts:211
(anonymous)	@	admin-portal.js:125
admin-portal.js:350 
 loadDashboardMetrics failed FirebaseError: The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/learnbridge-c600a/firestor…lvbnMvaW5kZXhlcy9fEAEaCgoGc3RhdHVzEAEaDAoIZGF0ZXRpbWUQARoMCghfX25hbWVfXxAB
loadDashboardMetrics	@	admin-portal.js:350
await in loadDashboardMetrics		
showSection	@	admin-portal.js:86
initAdminPortal	@	admin-portal.js:173
await in initAdminPortal		
(anonymous)	@	admin-portal.js:134
(anonymous)	@	auth_impl.ts:744
Promise.then		
registerStateListener	@	auth_impl.ts:744
onAuthStateChanged	@	auth_impl.ts:545
onAuthStateChanged	@	index.ts:211
(anonymous)	@	admin-portal.js:125


