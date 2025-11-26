import React from "react";

function ControlPanel() {
  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Autai Control Panel</h1>
          <p className="text-gray-600">Control and monitor your browser automation</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Status Card */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">System Status</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Main Window:</span>
                <span className="text-green-600 font-medium">Active</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">DOM Service:</span>
                <span className="text-green-600 font-medium">Connected</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Web Content:</span>
                <span className="text-blue-600 font-medium">Loaded</span>
              </div>
            </div>
          </div>

          {/* Quick Actions Card */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button className="w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
                Refresh DOM Tree
              </button>
              <button className="w-full px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors">
                Take Screenshot
              </button>
              <button className="w-full px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors">
                View Logs
              </button>
            </div>
          </div>

          {/* DOM Info Card */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">DOM Information</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Total Nodes:</span>
                <span className="font-medium">506</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Interactive Elements:</span>
                <span className="font-medium">60</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Current URL:</span>
                <span className="text-sm font-mono truncate">google.com</span>
              </div>
            </div>
          </div>

          {/* Settings Card */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Settings</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-gray-700">Auto-refresh</label>
                <input type="checkbox" className="w-4 h-4 text-blue-600 rounded" />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-gray-700">Show DevTools</label>
                <input type="checkbox" className="w-4 h-4 text-blue-600 rounded" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <label className="text-gray-700">Debug Mode</label>
                <input type="checkbox" className="w-4 h-4 text-blue-600 rounded" />
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Recent Activity</h2>
          <div className="space-y-2">
            <div className="flex items-center space-x-3 text-sm">
              <span className="text-gray-500">12:14:09</span>
              <span className="text-blue-600">DOM tree processed successfully</span>
            </div>
            <div className="flex items-center space-x-3 text-sm">
              <span className="text-gray-500">12:14:08</span>
              <span className="text-green-600">Page finished loading</span>
            </div>
            <div className="flex items-center space-x-3 text-sm">
              <span className="text-gray-500">12:14:08</span>
              <span className="text-blue-600">Control panel window created</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ControlPanel;