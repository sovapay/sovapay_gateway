import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Webhook, Plus, MoreVertical, Eye, Trash2 } from 'lucide-react';
import { Card, Badge, Button, Modal, Input, Dropdown, DropdownItem, DropdownSeparator, useToast } from '../../components/ui';
import { formatDateTime } from '../../utils/formatters';
import { useWebhooks } from '../../hooks';

const availableEvents = [
  { category: 'Payments', events: ['payment.created', 'payment.succeeded', 'payment.failed', 'payment.refunded'] },
  { category: 'Orders', events: ['order.created', 'order.updated', 'order.completed'] },
  { category: 'Settlements', events: ['settlement.created', 'settlement.paid'] },
  { category: 'Account', events: ['account.updated', 'account.verified'] },
  { category: 'Refunds', events: ['refund.created', 'refund.succeeded', 'refund.failed'] }
];

export function Webhooks() {
  const navigate = useNavigate();
  const { error: showError } = useToast();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [newWebhook, setNewWebhook] = useState({
    name: '',
    url: '',
    events: [] as string[],
    description: '',
  });

  // Use the new SDK hook
  const {
    webhooks,
    isLoading: loading,
    createWebhook,
    deleteWebhook,
    toggleWebhook,
  } = useWebhooks();

  const toggleEvent = (event: string) => {
    setNewWebhook(prev => ({
      ...prev,
      events: prev.events.includes(event)
        ? prev.events.filter(e => e !== event)
        : [...prev.events, event]
    }));
  };

  const handleCreateWebhook = async () => {
    if (!newWebhook.url) {
      showError('Please enter a webhook URL');
      return;
    }
    if (newWebhook.events.length === 0) {
      showError('Please select at least one event');
      return;
    }

    try {
      await createWebhook({
        url: newWebhook.url,
        events: newWebhook.events.join(','), // Convert array to comma-separated string
        is_active: 1
      });

      setShowAddModal(false);
      setNewWebhook({ name: '', url: '', events: [], description: '' });
    } catch (err: any) {
      // Error already shown by hook
    }
  };

  const handleDeleteWebhook = async () => {
    try {
      await deleteWebhook();
      setShowDeleteModal(false);
    } catch (err: any) {
      // Error already shown by hook
    }
  };

  const handleToggleStatus = async (webhook: any) => {
    const newStatus = webhook.is_active === 1;
    try {
      await toggleWebhook(!newStatus);
    } catch (err: any) {
      // Error already shown by hook
    }
  };



  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Webhooks</h1>
          <p className="text-sm text-slate-500 mt-1">
            Receive real-time event notifications
          </p>
        </div>
        {webhooks.length === 0 && (
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4" />
            Add endpoint
          </Button>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center">
          <p className="text-sm text-slate-500">Loading webhooks...</p>
        </div>
      ) : webhooks.length === 0 ? (
        <Card className="text-center py-12">
          <Webhook className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-slate-900 mb-2">No webhooks configured</h3>
          <p className="text-sm text-slate-500 mb-4">
            Add a webhook endpoint to receive real-time notifications about events.
          </p>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="w-4 h-4" />
            Add endpoint
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {webhooks.map((webhook: any) => (
            <Card key={webhook.name}>
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${webhook.is_active === 1 ? 'bg-success-100' : 'bg-slate-100'
                    }`}>
                    <Webhook className={`w-5 h-5 ${webhook.is_active === 1 ? 'text-success-600' : 'text-slate-400'
                      }`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium text-slate-900 font-mono">
                        {webhook.url}
                      </p>
                      <Badge variant={webhook.is_active === 1 ? 'success' : 'slate'} dot>
                        {webhook.is_active === 1 ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {webhook.events && webhook.events.split(',').slice(0, 3).map((event: string) => (
                        <span
                          key={event}
                          className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded"
                        >
                          {event.trim()}
                        </span>
                      ))}
                      {webhook.events && webhook.events.split(',').length > 3 && (
                        <span className="text-xs text-slate-500">
                          +{webhook.events.split(',').length - 3} more
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      Created {formatDateTime(webhook.creation)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigate(`/developers/webhooks/${webhook.name}`)}
                  >
                    <Eye className="w-4 h-4" />
                    View logs
                  </Button>
                  <Dropdown
                    trigger={
                      <button className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                        <MoreVertical className="w-4 h-4 text-slate-500" />
                      </button>
                    }
                  >
                    <DropdownItem onClick={() => handleToggleStatus(webhook)}>
                      {webhook.is_active === 1 ? 'Disable' : 'Enable'}
                    </DropdownItem>
                    <DropdownSeparator />
                    <DropdownItem
                      danger
                      icon={<Trash2 className="w-4 h-4" />}
                      onClick={() => setShowDeleteModal(true)}
                    >
                      Delete
                    </DropdownItem>
                  </Dropdown>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card className="bg-slate-50 border-slate-200">
        <h3 className="text-sm font-medium text-slate-900 mb-3">Webhook Security</h3>
        <p className="text-sm text-slate-600 mb-4">
          Verify webhook signatures to ensure requests are from SovaPay. Use your webhook signing secret to validate payloads.
        </p>
        <div className="bg-slate-900 rounded-lg p-4 overflow-x-auto">
          <pre className="text-sm text-slate-100 font-mono">
            {`const signature = req.headers['sovapay-signature'];
const payload = JSON.stringify(req.body);
const expected = crypto
  .createHmac('sha256', webhookSecret)
  .update(payload)
  .digest('hex');

if (signature === expected) {
  // Process the event
}`}
          </pre>
        </div>
      </Card>

      {/* Add Webhook Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Webhook Endpoint"
        description="Configure a new endpoint to receive event notifications"
        size="lg"
      >
        <div className="space-y-6">
          <Input
            label="Name (Optional)"
            placeholder="Production Webhook"
            value={newWebhook.name}
            onChange={(e) => setNewWebhook({ ...newWebhook, name: e.target.value })}
          />

          <Input
            label="Endpoint URL"
            placeholder="https://api.example.com/webhooks"
            value={newWebhook.url}
            onChange={(e) => setNewWebhook({ ...newWebhook, url: e.target.value })}
          />

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">
              Events to subscribe
            </label>
            <div className="space-y-4 max-h-64 overflow-y-auto">
              {availableEvents.map((category) => (
                <div key={category.category}>
                  <p className="text-xs font-medium text-slate-500 uppercase mb-2">
                    {category.category}
                  </p>
                  <div className="space-y-2">
                    {category.events.map((event) => (
                      <label key={event} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newWebhook.events.includes(event)}
                          onChange={() => toggleEvent(event)}
                          className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                        />
                        <span className="text-sm text-slate-700 font-mono">{event}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateWebhook}>
              Add endpoint
            </Button>
          </div>
        </div>
      </Modal>


      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);

        }}
        title="Delete Webhook"
        description="Are you sure you want to delete this webhook? This action cannot be undone."
      >
        <div className="space-y-4">
          <div className="bg-error-50 border border-error-200 rounded-lg p-4">
            <p className="text-sm text-error-800">
              This will permanently delete the webhook endpoint. Any applications using this webhook will stop receiving notifications.
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);

              }}
            >
              Cancel
            </Button>
            <Button
              className="bg-error-600 hover:bg-error-700 text-white"
              onClick={handleDeleteWebhook}
            >
              Delete Webhook
            </Button>
          </div>
        </div>
      </Modal>


    </div >
  );
}
