import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:urnlabs_mobile_sdk/urnlabs_mobile_sdk.dart';

void main() {
  runApp(const UrnlabsExampleApp());
}

class UrnlabsExampleApp extends StatelessWidget {
  const UrnlabsExampleApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (context) => AppState(),
      child: MaterialApp(
        title: 'Urnlabs SDK Example',
        theme: ThemeData(
          primarySwatch: Colors.blue,
        ),
        home: const HomePage(),
      ),
    );
  }
}

class AppState extends ChangeNotifier {
  bool _isInitialized = false;
  bool _isAuthenticated = false;
  String? _currentUser;
  String? _error;

  bool get isInitialized => _isInitialized;
  bool get isAuthenticated => _isAuthenticated;
  String? get currentUser => _currentUser;
  String? get error => _error;

  Future<void> initializeSDK() async {
    try {
      final config = SDKConfig.development();
      await UrnlabsSDK.initialize(config);
      _isInitialized = true;
      _error = null;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      notifyListeners();
    }
  }

  Future<void> signIn(String email, String password) async {
    try {
      final result = await UrnlabsSDK.instance.auth.signIn(email, password);
      if (result.user != null) {
        _isAuthenticated = true;
        _currentUser = result.user!.email;
        _error = null;
      }
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      notifyListeners();
    }
  }

  Future<void> signOut() async {
    try {
      await UrnlabsSDK.instance.auth.signOut();
      _isAuthenticated = false;
      _currentUser = null;
      _error = null;
      notifyListeners();
    } catch (e) {
      _error = e.toString();
      notifyListeners();
    }
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<AppState>().initializeSDK();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Urnlabs SDK Example'),
      ),
      body: Consumer<AppState>(
        builder: (context, appState, child) {
          if (!appState.isInitialized) {
            return const Center(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  CircularProgressIndicator(),
                  SizedBox(height: 16),
                  Text('Initializing SDK...'),
                ],
              ),
            );
          }

          if (appState.isAuthenticated) {
            return _buildAuthenticatedView(context, appState);
          } else {
            return _buildLoginView(context, appState);
          }
        },
      ),
    );
  }

  Widget _buildLoginView(BuildContext context, AppState appState) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Text(
            'Login to Urnlabs',
            style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 32),
          TextField(
            controller: _emailController,
            decoration: const InputDecoration(
              labelText: 'Email',
              border: OutlineInputBorder(),
            ),
            keyboardType: TextInputType.emailAddress,
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _passwordController,
            decoration: const InputDecoration(
              labelText: 'Password',
              border: OutlineInputBorder(),
            ),
            obscureText: true,
          ),
          const SizedBox(height: 24),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () {
                appState.signIn(
                  _emailController.text,
                  _passwordController.text,
                );
              },
              child: const Text('Sign In'),
            ),
          ),
          if (appState.error != null) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.red.shade100,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.red.shade300),
              ),
              child: Text(
                appState.error!,
                style: TextStyle(color: Colors.red.shade700),
              ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _buildAuthenticatedView(BuildContext context, AppState appState) {
    return Padding(
      padding: const EdgeInsets.all(16.0),
      child: Column(
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16.0),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Welcome, ${appState.currentUser}!',
                    style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  const Text('You are successfully authenticated with Urnlabs SDK.'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          Expanded(
            child: GridView.count(
              crossAxisCount: 2,
              mainAxisSpacing: 16,
              crossAxisSpacing: 16,
              children: [
                _buildFeatureCard(
                  'Workflows',
                  Icons.auto_awesome,
                  'Manage AI workflows',
                  () => _navigateToWorkflows(),
                ),
                _buildFeatureCard(
                  'Agents',
                  Icons.smart_toy,
                  'Chat with AI agents',
                  () => _navigateToAgents(),
                ),
                _buildFeatureCard(
                  'Files',
                  Icons.folder,
                  'Upload and manage files',
                  () => _navigateToFiles(),
                ),
                _buildFeatureCard(
                  'Settings',
                  Icons.settings,
                  'App settings',
                  () => _navigateToSettings(),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              onPressed: () => appState.signOut(),
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.red,
                foregroundColor: Colors.white,
              ),
              child: const Text('Sign Out'),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFeatureCard(String title, IconData icon, String description, VoidCallback onTap) {
    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(icon, size: 48, color: Theme.of(context).primaryColor),
              const SizedBox(height: 8),
              Text(
                title,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 4),
              Text(
                description,
                style: TextStyle(fontSize: 12, color: Colors.grey.shade600),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _navigateToWorkflows() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Workflows feature coming soon!')),
    );
  }

  void _navigateToAgents() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Agents feature coming soon!')),
    );
  }

  void _navigateToFiles() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Files feature coming soon!')),
    );
  }

  void _navigateToSettings() {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Settings feature coming soon!')),
    );
  }
}