// mostly copied from
// https://threejs.org/examples/webgl_physics_volume

var clock = new THREE.Clock();
var ballMaterial = new THREE.MeshPhongMaterial({ color: 0x202020 });
var pos = new THREE.Vector3();
var quat = new THREE.Quaternion();

// Physics variables
var gravityConstant = -9.8;
var physicsWorld;
var rigidBodies = [];
var softBodies = [];
var margin = 0.05;
var transformAux1 = new Ammo.btTransform();
var softBodyHelpers = new Ammo.btSoftBodyHelpers();

var armMovement = 0;

// ------------------------------------------------------------

// init graphics

var container = document.getElementById( 'container' );

var scene = new THREE.Scene();
scene.background = new THREE.Color( 0xbfd1e5 );

var renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( window.innerWidth, window.innerHeight );
container.appendChild( renderer.domElement );
renderer.domElement.style.cursor = 'pointer';

var camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 0.2, 2000 );
camera.position.set( 0, 8, 5 );

var controls = new THREE.OrbitControls( camera, renderer.domElement );
controls.enabled = false;

var ambientLight = new THREE.AmbientLight( 0x57646e );
scene.add( ambientLight );

var light = new THREE.DirectionalLight( 0xffffff, 0.6 );
light.position.set( 2, 2, 1 );

scene.add( light );

window.addEventListener( 'resize', resize, false );
function resize() {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );
}

// ------------------------------------------------------------

// init physics / physics configuration

var collisionConfiguration = new Ammo.btSoftBodyRigidBodyCollisionConfiguration();
var dispatcher = new Ammo.btCollisionDispatcher( collisionConfiguration );
var broadphase = new Ammo.btDbvtBroadphase();
var solver = new Ammo.btSequentialImpulseConstraintSolver();
var softBodySolver = new Ammo.btDefaultSoftBodySolver();
physicsWorld = new Ammo.btSoftRigidDynamicsWorld( dispatcher, broadphase, solver, collisionConfiguration, softBodySolver);
physicsWorld.setGravity( new Ammo.btVector3( 0, gravityConstant, 0 ) );
physicsWorld.getWorldInfo().set_m_gravity( new Ammo.btVector3( 0, gravityConstant, 0 ) );

// ------------------------------------------------------------

// create objects

// Ground
pos.set( 0, - 0.5, 0 );
quat.set( 0, 0, 0, 1 );
var groundMat = new THREE.MeshBasicMaterial({ color: 0x72acc4 });
var ground = createParalellepiped( 40, 1, 40, 0, pos, quat, groundMat );

// pillow soft volume
var volumeMass = 1;
var volumePressure = 11;
var w = 5, h = 1, d = 3;
var boxBufferGeo = new THREE.BoxBufferGeometry( w, h, d, w*4, h*4, d*4 );
boxBufferGeo.translate( 0, 2, 0 );

var pillowMat = new THREE.MeshPhongMaterial({
	color: 0xeeeeee,
	specular: 0x111111,
	shininess: 1
});

createSoftVolume( boxBufferGeo, pillowMat, volumeMass, volumePressure );

// ------------------------------------------------------------

// input

var clickRequest = false;

window.addEventListener( 'mousedown', mousedown, false );

function mousedown(e){
	if ( ! clickRequest ) {
		clickRequest = true;
	}
}

var range = 1.5;
var xPos = -range;

function processClick() {

	if ( clickRequest ) {

		// Creates a ball
		var ballMass = 3;
		var ballRadius = 0.4;
		var sphereGeo = new THREE.SphereGeometry( ballRadius, 18, 16 );
		var ballMesh = new THREE.Mesh( sphereGeo, ballMaterial );
		var ballShape = new Ammo.btSphereShape( ballRadius );
		ballShape.setMargin( margin );

		pos.set( xPos++, 3, THREE.Math.randFloatSpread( range ) );
		if (xPos >= range) xPos = -range;
		quat.set( 0, 0, 0, 1 );
		var ballBody = createRigidBody( ballMesh, ballShape, ballMass, pos, quat );
		ballBody.setFriction( 0.5 );
		ballBody.setLinearVelocity( new Ammo.btVector3( 0, -14, 0 ) );

		ballMesh.visible = false;

		setTimeout(function(){
			physicsWorld.removeRigidBody( ballBody );
			scene.remove( ballMesh );
		}, 500);

		clickRequest = false;

	}

}

// ------------------------------------------------------------

// Functions

function processGeometry( bufGeometry ) {

	// Obtain a Geometry
	var geometry = new THREE.Geometry().fromBufferGeometry( bufGeometry );

	// Merge the vertices so the triangle soup is converted to indexed triangles
	var vertsDiff = geometry.mergeVertices();

	// Convert again to BufferGeometry, indexed
	var indexedBufferGeom = createIndexedBufferGeometryFromGeometry( geometry );

	// Create index arrays mapping the indexed vertices to bufGeometry vertices
	mapIndices( bufGeometry, indexedBufferGeom );

}

function createIndexedBufferGeometryFromGeometry( geometry ) {

	var numVertices = geometry.vertices.length;
	var numFaces = geometry.faces.length;

	var bufferGeom = new THREE.BufferGeometry();
	var vertices = new Float32Array( numVertices * 3 );
	var indices = new ( numFaces * 3 > 65535 ? Uint32Array : Uint16Array )( numFaces * 3 );

	for ( var i = 0; i < numVertices; i++ ) {

		var p = geometry.vertices[ i ];

		var i3 = i * 3;

		vertices[ i3 ] = p.x;
		vertices[ i3 + 1 ] = p.y;
		vertices[ i3 + 2 ] = p.z;

	}

	for ( var i = 0; i < numFaces; i++ ) {

		var f = geometry.faces[ i ];

		var i3 = i * 3;

		indices[ i3 ] = f.a;
		indices[ i3 + 1 ] = f.b;
		indices[ i3 + 2 ] = f.c;

	}

	bufferGeom.setIndex( new THREE.BufferAttribute( indices, 1 ) );
	bufferGeom.addAttribute( 'position', new THREE.BufferAttribute( vertices, 3 ) );

	return bufferGeom;
}

function isEqual( x1, y1, z1, x2, y2, z2 ) {

	var delta = 0.000001;
	return Math.abs( x2 - x1 ) < delta &&
				Math.abs( y2 - y1 ) < delta &&
				Math.abs( z2 - z1 ) < delta;

}

function mapIndices( bufGeometry, indexedBufferGeom ) {

	// Creates ammoVertices, ammoIndices and ammoIndexAssociation in bufGeometry

	var vertices = bufGeometry.attributes.position.array;
	var idxVertices = indexedBufferGeom.attributes.position.array;
	var indices = indexedBufferGeom.index.array;

	var numIdxVertices = idxVertices.length / 3;
	var numVertices = vertices.length / 3;

	bufGeometry.ammoVertices = idxVertices;
	bufGeometry.ammoIndices = indices;
	bufGeometry.ammoIndexAssociation = [];

	for ( var i = 0; i < numIdxVertices; i++ ) {

		var association = [];
		bufGeometry.ammoIndexAssociation.push( association );

		var i3 = i * 3;

		for ( var j = 0; j < numVertices; j++ ) {

			var j3 = j * 3;
			if ( isEqual( idxVertices[ i3 ], idxVertices[ i3 + 1 ],  idxVertices[ i3 + 2 ],
							vertices[ j3 ], vertices[ j3 + 1 ], vertices[ j3 + 2 ] ) ) {
					association.push( j3 );
			}

		}

	}

}

function createSoftVolume( bufferGeom, volumeMat, mass, pressure ) {

	processGeometry( bufferGeom );

	var volume = new THREE.Mesh( bufferGeom, volumeMat );
	volume.frustumCulled = false;
	scene.add( volume );

	// Volume physic object

	var volumeSoftBody = softBodyHelpers.CreateFromTriMesh(
			physicsWorld.getWorldInfo(),
			bufferGeom.ammoVertices,
			bufferGeom.ammoIndices,
			bufferGeom.ammoIndices.length / 3,
			true );

	var sbConfig = volumeSoftBody.get_m_cfg();
	sbConfig.set_viterations( 40 );
	sbConfig.set_piterations( 40 );

	// Soft-soft and soft-rigid collisions
	sbConfig.set_collisions( 0x11 );

	// Friction
	sbConfig.set_kDF( 0.1 );
	// Damping
	sbConfig.set_kDP( 0.01 );
	// Pressure
	sbConfig.set_kPR( pressure );
	// Stiffness
	volumeSoftBody.get_m_materials().at( 0 ).set_m_kLST( 0.9 );
	volumeSoftBody.get_m_materials().at( 0 ).set_m_kAST( 0.9 );

	volumeSoftBody.setTotalMass( mass, false )
	Ammo.castObject( volumeSoftBody, Ammo.btCollisionObject ).getCollisionShape().setMargin( margin );
	physicsWorld.addSoftBody( volumeSoftBody, 1, -1 );
	volume.userData.physicsBody = volumeSoftBody;
	// Disable deactivation
	volumeSoftBody.setActivationState( 4 );

	softBodies.push( volume );

}

function createParalellepiped( sx, sy, sz, mass, pos, quat, material ) {

	var threeObject = new THREE.Mesh( new THREE.BoxGeometry( sx, sy, sz, 1, 1, 1 ), material );
	var shape = new Ammo.btBoxShape( new Ammo.btVector3( sx * 0.5, sy * 0.5, sz * 0.5 ) );
	shape.setMargin( margin );

	createRigidBody( threeObject, shape, mass, pos, quat );

	return threeObject;

}

function createRigidBody( threeObject, physicsShape, mass, pos, quat ) {

	threeObject.position.copy( pos );
	threeObject.quaternion.copy( quat );

	var transform = new Ammo.btTransform();
	transform.setIdentity();
	transform.setOrigin( new Ammo.btVector3( pos.x, pos.y, pos.z ) );
	transform.setRotation( new Ammo.btQuaternion( quat.x, quat.y, quat.z, quat.w ) );
	var motionState = new Ammo.btDefaultMotionState( transform );

	var localInertia = new Ammo.btVector3( 0, 0, 0 );
	physicsShape.calculateLocalInertia( mass, localInertia );

	var rbInfo = new Ammo.btRigidBodyConstructionInfo( mass, motionState, physicsShape, localInertia );
	var body = new Ammo.btRigidBody( rbInfo );

	threeObject.userData.physicsBody = body;

	scene.add( threeObject );

	if ( mass > 0 ) {

		rigidBodies.push( threeObject );

		// Disable deactivation
		body.setActivationState( 4 );

	}

	physicsWorld.addRigidBody( body );

	return body;

}

function updatePhysics( deltaTime ) {

	// Step world
	physicsWorld.stepSimulation( deltaTime, 10 );

	// Update soft volumes
	for ( var i = 0, il = softBodies.length; i < il; i++ ) {
		var volume = softBodies[ i ];
		var geometry = volume.geometry;
		var softBody = volume.userData.physicsBody;
		var volumePositions = geometry.attributes.position.array;
		var volumeNormals = geometry.attributes.normal.array;
		var association = geometry.ammoIndexAssociation;
		var numVerts = association.length;
		var nodes = softBody.get_m_nodes();
		for ( var j = 0; j < numVerts; j ++ ) {

			var node = nodes.at( j );
			var nodePos = node.get_m_x();
			var x = nodePos.x();
			var y = nodePos.y();
			var z = nodePos.z();
			var nodeNormal = node.get_m_n();
			var nx = nodeNormal.x();
			var ny = nodeNormal.y();
			var nz = nodeNormal.z();

			var assocVertex = association[ j ];

			for ( var k = 0, kl = assocVertex.length; k < kl; k++ ) {
				var indexVertex = assocVertex[ k ];
				volumePositions[ indexVertex ] = x;
				volumeNormals[ indexVertex ] = nx;
				indexVertex++;
				volumePositions[ indexVertex ] = y;
				volumeNormals[ indexVertex ] = ny;
				indexVertex++;
				volumePositions[ indexVertex ] = z;
				volumeNormals[ indexVertex ] = nz;
			}
		}

		geometry.attributes.position.needsUpdate = true;
		geometry.attributes.normal.needsUpdate = true;

	}

	// Update rigid bodies
	for ( var i = 0, il = rigidBodies.length; i < il; i++ ) {
		var objThree = rigidBodies[ i ];
		var objPhys = objThree.userData.physicsBody;
		var ms = objPhys.getMotionState();
		if ( ms ) {

			ms.getWorldTransform( transformAux1 );
			var p = transformAux1.getOrigin();
			var q = transformAux1.getRotation();
			objThree.position.set( p.x(), p.y(), p.z() );
			objThree.quaternion.set( q.x(), q.y(), q.z(), q.w() );

		}
	}

}

loop();

function loop() {

	requestAnimationFrame( loop );

	var deltaTime = clock.getDelta();

	updatePhysics( deltaTime );

	processClick();

	renderer.render( scene, camera );

}